import type { Entity, World } from 'koota';
import { lerp } from '../core/math';
import { getContext } from '../sim/context';
import { themeOf } from '../sim/level/themes';
import {
  Aim,
  Combat,
  Controller,
  Crown,
  Dead,
  Destructible,
  Hazard,
  HazardKind,
  Health,
  Held,
  HeldBy,
  MatchState,
  OwnedBy,
  PartOf,
  Player,
  PrevTransform,
  Projectile,
  ProjectileKind,
  RagdollPart,
  RagdollParts,
  RoundPhase,
  RoundState,
  Shape,
  ShapeKind,
  Snake,
  Status,
  Transform,
  Weapon,
} from '../sim/traits';
import type { LightEmitter } from './gpu/lighting';
import { weaponByIndex } from '../sim/weapons/defs';
import { SWING_TICKS } from '../sim/weapons/projectiles';
import type { SimHandle } from '../sim/world';
import { updateCamera, type CameraState } from './camera';
import { decorForLevel, decorGroups } from './decor';
import type { PersistentDecalLayer } from './fx/decals';
import { P_GLOW, type ParticleSystem } from './fx/particles';
import { Layer, group, type RenderFrame, type ShapeGroup } from './frame';
import { FIGURE, buildFigure, emptyLimbState, secondaryFromVelocity, type LimbState } from './figure';
import { hazardGroups } from './hazardShapes';
import { PRIM_CAPSULE, PRIM_DISK, PRIM_PIE, PRIM_ROUNDED_BOX, PRIM_TRIANGLE, shade, withAlpha, type Primitive } from './sdf/primitives';
import { WEAPON_INK, placeWeapon, weaponLook } from './weaponShapes';

export const COLORS = ['#f5c542', '#3f8cff', '#ef4f3f', '#3fd47a'];
export const COLORS_CB = ['#f0e442', '#0072b2', '#d55e00', '#009e73'];
export const INK = '#1b1c22';

// Per-fighter presentation state (secondary limb motion, hurt flash). Keyed by entity id, so it must be
// dropped whenever the sim world changes: a fresh match reuses ids and restarts the tick counter.
const limbs = new Map<number, LimbState>();
const hurt = new Map<number, { hp: number; until: number }>();
let stateWorld: World | null = null;
const heldWeapons = new Map<number, { defId: number }>();

export type BuildFrameOpts = {
  debug?: boolean;
  freezeCamera?: boolean;
  colorblind?: boolean;
  decalLayer?: PersistentDecalLayer;
  flash?: number;
  /** Wall-clock seconds for cosmetic animation (decor, lava, lasers). */
  time?: number;
  /**
   * Seconds this frame advances the figures' secondary motion (limb springs, run cycle, blinks).
   * Pass the real frame time scaled by the sim's time scale; 0 holds them still (paused).
   */
  dt?: number;
};

function disk(cx: number, cy: number, r: number): Primitive {
  return { kind: PRIM_DISK, ax: cx, ay: cy, bx: cx, by: cy, r };
}
function cap(ax: number, ay: number, bx: number, by: number, r: number): Primitive {
  return { kind: PRIM_CAPSULE, ax, ay, bx, by, r };
}

export function playerColor(index: number, colorblind = false): string {
  const palette = colorblind ? COLORS_CB : COLORS;
  return palette[index % 4] ?? palette[0]!;
}

export function buildFrame(
  sim: SimHandle,
  cam: CameraState,
  alpha: number,
  viewW: number,
  viewH: number,
  particles: ParticleSystem | null,
  opts: BuildFrameOpts = {},
): RenderFrame {
  const world = sim.ecs;
  if (world !== stateWorld) {
    limbs.clear();
    hurt.clear();
    stateWorld = world;
  }
  const ctx = getContext(world);
  const theme = themeOf(ctx.level.theme);
  const groups: ShapeGroup[] = [];
  const targets: { x: number; y: number }[] = [];
  const lights: LightEmitter[] = [];
  const time = opts.time ?? ctx.tick / 60;
  const tick = ctx.tick;
  const bounds = ctx.level.bounds;

  // Backdrop decor with parallax.
  const decor = decorForLevel(ctx.level, theme);
  for (const g of decorGroups(decor, theme, cam, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }, time)) groups.push(g);

  // Hazards and solids drawn from their real fixture geometry.
  world.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev], e) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    const angle = lerpAngle(prev.angle, t.angle, alpha);
    const shape = e.get(Shape) ?? { kind: ShapeKind.Box, hx: 0.3, hy: 0.3, r: 0.3 };
    const d = e.get(Destructible);
    const health = d ? Math.max(0, Math.min(1, d.hp / Math.max(1, d.maxHp))) : 1;
    if (hz.kind === HazardKind.Lava) {
      lights.push({ x, y: y + shape.hy, radius: Math.max(3, shape.hx * 1.5), r: 1, g: 0.4, b: 0.1, intensity: 0.8 });
    }
    if (hz.kind === HazardKind.Laser && hz.armed) {
      lights.push({ x: x + (hz.param3 || 14) / 2, y, radius: 3, r: 0.3, g: 0.9, b: 1, intensity: 0.4 });
    }
    for (const g of hazardGroups({ kind: hz.kind, x, y, angle, shape, hz, health, tick, time }, theme)) groups.push(g);
  });

  // Players (alive): figure + eyes + held weapon + crown + block arc.
  const anchors = new Map<number, { x: number; y: number; angle: number; flip: boolean }>();
  const hudPlayers: NonNullable<RenderFrame['hud']['players']> = [];
  // Held weapons by holder, gathered once rather than by a query per fighter.
  heldWeapons.clear();
  for (const w of world.query(Weapon, Held)) {
    const holder = w.targetFor(HeldBy);
    if (holder !== undefined) heldWeapons.set(holder as unknown as number, w.get(Weapon)!);
  }
  world.query(Player, Transform, PrevTransform, Controller, Aim, Combat).updateEach(([p, t, prev, ctrl, aim, combat], e) => {
    const dead = e.has(Dead);
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    if (!dead) targets.push({ x, y });
    const color = playerColor(p.color, opts.colorblind);
    const sec = secondaryFromVelocity(limbs.get(e) ?? emptyLimbState(), ctrl.vx, ctrl.vy, ctrl.grounded, opts.dt ?? 1 / 60);
    limbs.set(e, sec);
    const hp = e.get(Health);
    const hurtState = hurt.get(e) ?? { hp: hp?.hp ?? 0, until: -1 };
    if (hp && hp.hp < hurtState.hp) hurtState.until = tick + 8;
    hurtState.hp = hp?.hp ?? hurtState.hp;
    hurt.set(e, hurtState);
    const hurtTicks = hurtState.until > tick ? hurtState.until - tick : 0;

    const wep = heldWeapons.get(e as unknown as number);
    const held = wep ? weaponByIndex(wep.defId) : null;

    const fig = buildFigure(
      {
        x,
        y,
        facing: ctrl.facing,
        ducking: ctrl.ducking,
        grounded: ctrl.grounded,
        wallSliding: ctrl.wallSliding,
        wallDir: ctrl.wallDir,
        vx: ctrl.vx,
        vy: ctrl.vy,
        aimX: aim.x,
        aimY: aim.y,
        punching: combat.punchActive > 0,
        blocking: combat.blocking,
        dead,
        phase: tick / 60,
        weapon: held ? { length: held.shape.length, twoHanded: held.twoHanded } : null,
        hurt: hurtTicks,
      },
      sec,
    );
    const bodyColor = hurtTicks > 5 ? shade(color, 0.45) : color;
    groups.push(group(fig.body, bodyColor, Layer.Players, { blend: 'smoothUnion', smoothK: FIGURE.smoothK, style: 'shaded', pad: 0.4 }));
    groups.push(group(fig.eyes, INK, Layer.Players, { style: 'flat', pad: 0.1 }));
    anchors.set(e, fig.weaponAnchor);

    if (combat.stun > 0 && !dead) {
      // Seeing stars: a few sparks circling the head while the fighter is staggered.
      const orbit = fig.head.r + 0.14;
      const spin = time * 9;
      const stars: Primitive[] = [];
      for (let i = 0; i < 3; i++) {
        const a = spin + (i * Math.PI * 2) / 3;
        stars.push(disk(fig.head.x + Math.cos(a) * orbit, fig.head.y + 0.08 + Math.sin(a) * orbit * 0.35, 0.045));
      }
      groups.push(group(stars, withAlpha('#fff4aa', 0.9), Layer.Overlay, { style: 'flat', fx: 'glow', glow: 0.2 }));
    }

    const status = e.get(Status);
    if (status && status.burning > 0 && !dead) {
      // On fire: tongues of flame licking up the torso, guttering as the burn runs out.
      const strength = Math.min(1, status.burning / 30);
      const flames: Primitive[] = [];
      for (let i = 0; i < 4; i++) {
        const ph = time * 13 + i * 1.9 + (e as unknown as number) * 0.7;
        const fx = x + (i - 1.5) * 0.14 + Math.sin(ph) * 0.1;
        const fy = y - 0.3 + i * 0.16 + Math.abs(Math.sin(ph * 0.8)) * 0.45;
        flames.push(disk(fx, fy, (0.13 + 0.05 * Math.sin(ph * 1.3)) * (0.6 + 0.4 * strength)));
      }
      groups.push(group(flames, withAlpha('#ff7a1a', 0.85), Layer.Projectiles, { blend: 'smoothUnion', smoothK: 0.18, style: 'flat', fx: 'glow', glow: 0.5 }));
      groups.push(group(flames.slice(1, 3).map((f) => disk(f.ax, f.ay - 0.04, f.r * 0.5)), withAlpha('#fff1b0', 0.8), Layer.Projectiles, { style: 'flat', pad: 0.1 }));
      lights.push({ x, y, radius: 2.4, r: 1, g: 0.55, b: 0.2, intensity: 0.45 * strength });
    }

    if (e.has(Crown) && !dead) {
      const hx = fig.head.x;
      const hy = fig.head.y + fig.head.r + 0.12;
      groups.push(
        group(
          [
            { kind: PRIM_ROUNDED_BOX, ax: hx, ay: hy, bx: 0.26, by: 0.07, r: 0.02, rot: 0 },
            { kind: PRIM_TRIANGLE, ax: hx - 0.17, ay: hy + 0.05, bx: 0.09, by: 0.2, r: 0.01, rot: 0 },
            { kind: PRIM_TRIANGLE, ax: hx, ay: hy + 0.05, bx: 0.09, by: 0.26, r: 0.01, rot: 0 },
            { kind: PRIM_TRIANGLE, ax: hx + 0.17, ay: hy + 0.05, bx: 0.09, by: 0.2, r: 0.01, rot: 0 },
          ],
          '#f7d048',
          Layer.Overlay,
          { blend: 'union', style: 'shaded', pad: 0.15 },
        ),
      );
      groups.push(group([disk(hx - 0.17, hy + 0.2, 0.035), disk(hx, hy + 0.27, 0.04), disk(hx + 0.17, hy + 0.2, 0.035)], '#ff5a7a', Layer.Overlay, { style: 'flat', pad: 0.1 }));
    }

    if (combat.blocking && !dead) {
      const arc = (ctx.tuning.blockArcDeg * Math.PI) / 180 / 2;
      const base = Math.atan2(aim.y, aim.x);
      const meter = Math.max(0, Math.min(1, combat.blockMeter));
      const perfect = tick - combat.blockStartTick < ctx.tuning.perfectBlockTicks;
      const shieldColor = perfect ? '#ffffff' : withAlpha('#c8dcff', 0.35 + 0.45 * meter);
      const cx = x + aim.x * 0.15;
      const cy = y + 0.2 + aim.y * 0.15;
      groups.push(
        group([{ kind: PRIM_PIE, ax: cx, ay: cy, bx: arc, by: 0, r: 1.05, rot: base - Math.PI / 2 }], shieldColor, Layer.Overlay, {
          style: 'outline',
          pad: 0.2,
          fx: perfect ? 'glow' : undefined,
        }),
      );
      groups.push(
        group([{ kind: PRIM_PIE, ax: cx, ay: cy, bx: arc, by: 0, r: 1.0, rot: base - Math.PI / 2 }], withAlpha('#c8dcff', 0.12 + 0.12 * meter), Layer.Overlay, {
          style: 'flat',
          pad: 0.2,
        }),
      );
    }
  });

  for (const e of ctx.players) {
    const p = e.get(Player);
    if (!p) continue;
    const hp = e.get(Health);
    hudPlayers.push({
      slot: p.slot,
      color: playerColor(p.color, opts.colorblind),
      alive: !e.has(Dead),
      crown: e.has(Crown),
      hp: hp?.hp ?? 0,
      maxHp: hp?.maxHp ?? 100,
    });
  }
  hudPlayers.sort((a, b) => a.slot - b.slot);

  // Weapons: held ones ride the hand; loose ones use their body transform.
  world.query(Weapon, Transform, PrevTransform).updateEach(([w, t, prev], e) => {
    const def = weaponByIndex(w.defId);
    const look = weaponLook(def.shape.kind, def.shape.length);
    let placedBody: Primitive[];
    let placedAccent: Primitive[];
    if (e.has(Held)) {
      const holder = e.targetFor(HeldBy);
      const a = holder !== undefined ? anchors.get(holder) : undefined;
      if (!a) return;
      placedBody = placeWeapon(look.body, a.x, a.y, a.angle, a.flip);
      placedAccent = placeWeapon(look.accent, a.x, a.y, a.angle, a.flip);
    } else {
      const x = lerp(prev.x, t.x, alpha);
      const y = lerp(prev.y, t.y, alpha);
      const angle = lerpAngle(prev.angle, t.angle, alpha);
      // loose weapons: grip offset so the silhouette sits on its body center
      const ox = -def.shape.length * 0.35;
      const gx = x + Math.cos(angle) * ox;
      const gy = y + Math.sin(angle) * ox;
      placedBody = placeWeapon(look.body, gx, gy, angle, false);
      placedAccent = placeWeapon(look.accent, gx, gy, angle, false);
      if (w.pickupCooldown <= 0 && !w.thrown) {
        // pickup shimmer
        const pulse = 0.5 + 0.5 * Math.sin(time * 5);
        groups.push(group([disk(x, y, 0.45 + pulse * 0.08)], withAlpha('#ffffff', 0.06 + pulse * 0.06), Layer.Weapons, { style: 'flat', pad: 0.2 }));
      }
    }
    groups.push(group(placedBody, WEAPON_INK, Layer.Weapons, { blend: 'smoothUnion', smoothK: 0.04, style: 'shaded', pad: 0.2 }));
    if (placedAccent.length) groups.push(group(placedAccent, look.accentColor, Layer.Weapons, { style: 'flat', pad: 0.2, fx: look.glow ? 'glow' : undefined, glow: 0.25 }));
  });

  // Projectiles.
  world.query(Projectile).updateEach(([p], e) => {
    if (e.has(Snake)) return;
    const def = weaponByIndex(p.defId);
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const dx = p.vx / speed;
    const dy = p.vy / speed;
    switch (p.kind) {
      case ProjectileKind.Bullet:
      case ProjectileKind.Pellet: {
        const trail = Math.min(1.4, speed * 0.028);
        const hot = def.projectile.rare ? '#fff2a8' : '#fff7d6';
        groups.push(group([cap(p.x, p.y, p.x - dx * trail, p.y - dy * trail, 0.055)], withAlpha(hot, 0.95), Layer.Projectiles, { style: 'flat', fx: 'glow', glow: 0.28 }));
        groups.push(group([cap(p.x - dx * trail * 0.6, p.y - dy * trail * 0.6, p.x - dx * trail * 2.2, p.y - dy * trail * 2.2, 0.035)], withAlpha('#ffd27a', 0.35), Layer.Projectiles, { style: 'flat', pad: 0.2 }));
        if (def.id === 'god-pistol') groups.push(group([disk(p.x, p.y, 0.22)], withAlpha('#f7d048', 0.8), Layer.Projectiles, { style: 'flat', fx: 'glow', glow: 0.5 }));
        break;
      }
      case ProjectileKind.Grenade:
      case ProjectileKind.BurstInto: {
        // Shell size matches the physics body, not the blast radius.
        const r = def.projectile.burstInto === 'spike' ? 0.24 : 0.16;
        const angle = time * 8;
        const snakeish = def.projectile.burstInto === 'snake';
        groups.push(group([disk(p.x, p.y, r), { kind: PRIM_ROUNDED_BOX, ax: p.x, ay: p.y + r * 0.9, bx: r * 0.35, by: r * 0.25, r: 0.02, rot: angle }], snakeish ? '#5f9e3a' : '#3d5a2d', Layer.Projectiles, {
          blend: 'smoothUnion',
          smoothK: 0.05,
          style: 'shaded',
          pad: 0.2,
        }));
        groups.push(group([{ kind: PRIM_ROUNDED_BOX, ax: p.x, ay: p.y, bx: r * 0.9, by: r * 0.15, r: 0.02, rot: angle }], INK, Layer.Projectiles, { style: 'flat', pad: 0.1 }));
        if (p.fuse > 0 && p.fuse < 40 && Math.floor(p.fuse / 4) % 2 === 0) {
          groups.push(group([disk(p.x, p.y, r * 0.35)], '#ff3b30', Layer.Projectiles, { style: 'flat', fx: 'glow', glow: 0.25 }));
        }
        break;
      }
      case ProjectileKind.Rocket: {
        const len = 0.5;
        groups.push(group([cap(p.x - dx * len * 0.5, p.y - dy * len * 0.5, p.x + dx * len * 0.35, p.y + dy * len * 0.35, 0.11)], '#8a8f99', Layer.Projectiles, { style: 'shaded', pad: 0.3 }));
        groups.push(group([{ kind: PRIM_TRIANGLE, ax: p.x + dx * len * 0.35, ay: p.y + dy * len * 0.35, bx: 0.12, by: 0.24, r: 0.01, rot: Math.atan2(dy, dx) - Math.PI / 2 }], '#e85d4c', Layer.Projectiles, { style: 'flat', pad: 0.2 }));
        const flick = 0.12 + 0.06 * Math.sin(time * 60);
        groups.push(group([disk(p.x - dx * len * 0.7, p.y - dy * len * 0.7, flick), disk(p.x - dx * len * 1.0, p.y - dy * len * 1.0, flick * 0.7)], withAlpha('#ffb347', 0.9), Layer.Projectiles, { blend: 'smoothUnion', smoothK: 0.1, style: 'flat', fx: 'glow', glow: 0.5 }));
        lights.push({ x: p.x, y: p.y, radius: 2.2, r: 1, g: 0.6, b: 0.2, intensity: 0.5 });
        break;
      }
      case ProjectileKind.Beam: {
        const ownerEntity = ownerOf(e);
        const aim = ownerEntity?.get(Aim);
        const ot = ownerEntity?.get(Transform);
        if (aim && ot) {
          const a = anchors.get(ownerEntity as unknown as number);
          const sx = a?.x ?? ot.x;
          const sy = a?.y ?? ot.y;
          const ex = sx + aim.x * 40;
          const ey = sy + aim.y * 40;
          const isLava = def.category === 'lava';
          const core = isLava ? '#fff1c0' : '#e8fdff';
          const glow = isLava ? '#ff7a1a' : '#39f2ff';
          groups.push(group([cap(sx, sy, ex, ey, 0.16 + 0.03 * Math.sin(time * 50))], withAlpha(glow, 0.7), Layer.Projectiles, { style: 'flat', fx: 'glow', glow: 0.7 }));
          groups.push(group([cap(sx, sy, ex, ey, 0.05)], core, Layer.Projectiles, { style: 'flat', pad: 0.2 }));
        }
        break;
      }
      case ProjectileKind.Field: {
        const r = Math.max(0.6, def.projectile.radius * 0.5);
        if (def.id === 'black-hole') {
          // A compact seed in flight; open, it swells into the well proper, with a faint rim marking
          // how far the drag reaches and motes spiralling in so the pull reads even on an empty stage.
          const open = p.phase === 1;
          const core = open ? r * 0.8 : 0.32;
          groups.push(group([disk(p.x, p.y, core)], '#0a0410', Layer.Projectiles, { style: 'flat', fx: 'hole', pad: open ? r : 0.5 }));
          groups.push(group([disk(p.x, p.y, core * 1.18)], withAlpha('#a05cff', 0.5), Layer.Projectiles, { style: 'outline', fx: 'glow', glow: open ? r * 0.8 : 0.4 }));
          if (open) {
            const reach = def.projectile.radius;
            groups.push(group([disk(p.x, p.y, reach)], withAlpha('#8a4cff', 0.14), Layer.Projectiles, { style: 'outline', pad: 0.3 }));
            const motes = [];
            for (let k = 0; k < 6; k++) {
              const fall = 1 - ((time * 0.55 + k * 0.17) % 1);
              const ang = time * (2.2 + k * 0.3) + k * 1.05 + fall * 4;
              const dist = core + (reach - core) * fall * fall;
              motes.push(disk(p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist * 0.8, 0.06 + 0.05 * fall));
            }
            groups.push(group(motes, withAlpha('#d9b8ff', 0.75), Layer.Projectiles, { style: 'flat', fx: 'glow', glow: 0.3 }));
          }
        } else if (def.id === 'time-bubble') {
          groups.push(group([disk(p.x, p.y, r * 1.6)], withAlpha('#7ae7ff', 0.18), Layer.Projectiles, { style: 'flat', pad: 0.4 }));
          groups.push(group([disk(p.x, p.y, r * 1.6)], withAlpha('#c9f5ff', 0.6), Layer.Projectiles, { style: 'outline', pad: 0.4 }));
        } else if (def.projectile.status === 'burn') {
          // A gout of flame: swells and cools as it flies, then gutters out over the last third of its fuse.
          const age = 1 - Math.max(0, Math.min(1, p.fuse / Math.max(1, def.projectile.fuse)));
          const flick = Math.sin(time * 42 + p.x * 9 + p.y * 7);
          const size = 0.2 + age * 0.34 + flick * 0.03;
          const fade = age < 0.66 ? 1 : 1 - (age - 0.66) / 0.34;
          const lick = { x: -dx * size * 0.7 + Math.cos(time * 31 + p.y * 5) * 0.08, y: -dy * size * 0.7 + 0.12 + Math.sin(time * 37 + p.x * 5) * 0.08 };
          const tongue = { x: -dx * size * 1.3, y: -dy * size * 1.3 + 0.2 };
          groups.push(group([disk(p.x, p.y, size), disk(p.x + lick.x, p.y + lick.y, size * 0.7), disk(p.x + tongue.x, p.y + tongue.y, size * 0.45)], withAlpha(age < 0.5 ? '#ff8a2a' : '#ff5a1a', 0.9 * fade), Layer.Projectiles, { blend: 'smoothUnion', smoothK: 0.2, style: 'flat', fx: 'glow', glow: 0.55 }));
          groups.push(group([disk(p.x + dx * size * 0.15, p.y + dy * size * 0.15, size * 0.5)], withAlpha('#fff1b0', 0.85 * fade), Layer.Projectiles, { style: 'flat', pad: 0.1 }));
          lights.push({ x: p.x, y: p.y, radius: 2, r: 1, g: 0.55, b: 0.2, intensity: 0.35 * fade });
        } else {
          groups.push(group([disk(p.x, p.y, r * 0.5)], withAlpha(def.id === 'glue-gun' ? '#ffe27a' : '#8fd6ff', 0.85), Layer.Projectiles, { style: 'shaded', pad: 0.3 }));
        }
        break;
      }
      case ProjectileKind.Melee: {
        // A slash: a crescent that sweeps top-to-bottom across the aim over the swing window and fades out.
        const ownerEntity = ownerOf(e);
        const aim = ownerEntity?.get(Aim);
        const a = ownerEntity ? anchors.get(ownerEntity as unknown as number) : undefined;
        if (aim && a) {
          const base = Math.atan2(aim.y, aim.x);
          const reach = 0.35 + def.projectile.radius;
          const life = Math.max(0, Math.min(1, p.fuse / SWING_TICKS));
          const sweep = (0.5 - life) * 1.6;
          const halfWidth = 0.6;
          const fade = 0.25 + 0.55 * life;
          groups.push(group([{ kind: PRIM_PIE, ax: a.x, ay: a.y, bx: halfWidth, by: 0, r: reach + 0.25, rot: base + sweep - Math.PI / 2 }], withAlpha('#ffffff', 0.16 * fade), Layer.Projectiles, { style: 'flat', pad: 0.3 }));
          // The streak itself: an arc of capsules at the blade tip, thickest in the middle so it tapers like a brush stroke.
          const arcR = reach + 0.15;
          const segs = 6;
          const streak: Primitive[] = [];
          for (let i = 0; i < segs; i++) {
            const a0 = base + sweep - halfWidth + (2 * halfWidth * i) / segs;
            const a1 = base + sweep - halfWidth + (2 * halfWidth * (i + 1)) / segs;
            const thick = 0.015 + 0.06 * Math.sin(((i + 0.5) / segs) * Math.PI);
            streak.push(cap(a.x + Math.cos(a0) * arcR, a.y + Math.sin(a0) * arcR, a.x + Math.cos(a1) * arcR, a.y + Math.sin(a1) * arcR, thick));
          }
          groups.push(group(streak, withAlpha('#ffffff', 0.9 * fade), Layer.Projectiles, { blend: 'smoothUnion', smoothK: 0.08, style: 'flat', fx: 'glow', glow: 0.3 }));
        }
        break;
      }
      default:
        groups.push(group([disk(p.x, p.y, 0.12)], '#fff4c2', Layer.Projectiles, { style: 'flat', pad: 0.2 }));
    }
  });

  // Snakes.
  world.query(Snake, Transform, PrevTransform, Health).updateEach(([snake, t, prev]) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    const dir = Math.sign(t.x - prev.x) || 1;
    const s = snake.giant ? 1.8 : 1;
    const segs: Primitive[] = [];
    let px = x;
    let py = y;
    for (let i = 0; i < 5; i++) {
      const nx = px - dir * 0.22 * s;
      const ny = y + Math.sin(time * 14 + i * 1.4) * 0.07 * s;
      segs.push(cap(px, py, nx, ny, (0.11 - i * 0.012) * s));
      px = nx;
      py = ny;
    }
    const headX = x + dir * 0.12 * s;
    segs.unshift(disk(headX, y + 0.02, 0.15 * s));
    groups.push(group(segs, snake.flying ? '#a2e05a' : '#6bbf3a', Layer.Projectiles, { blend: 'smoothUnion', smoothK: 0.08, style: 'shaded', pad: 0.3 }));
    groups.push(group([disk(headX + dir * 0.06 * s, y + 0.07 * s, 0.03 * s), cap(headX + dir * 0.15 * s, y - 0.02 * s, headX + dir * 0.26 * s, y - 0.04 * s, 0.015 * s)], INK, Layer.Projectiles, { style: 'flat', pad: 0.1 }));
    if (snake.flying) {
      const flap = Math.sin(time * 20) * 0.5;
      groups.push(group([{ kind: PRIM_TRIANGLE, ax: x, ay: y + 0.1 * s, bx: 0.22 * s, by: 0.3 * s, r: 0.01, rot: Math.PI / 2 + flap }, { kind: PRIM_TRIANGLE, ax: x, ay: y + 0.1 * s, bx: 0.22 * s, by: 0.3 * s, r: 0.01, rot: -Math.PI / 2 - flap }], withAlpha('#d8f5b0', 0.8), Layer.Projectiles, { style: 'flat', pad: 0.3 }));
    }
  });

  // Ragdolls: one smooth silhouette per corpse in the owner's color.
  const ragdolls = new Map<number, { color: string; parts: Primitive[]; eyes: Primitive[] }>();
  const corpses: { x: number; y: number }[] = [];
  world.query(RagdollPart, Transform, PrevTransform).updateEach(([part, t, prev], e) => {
    const root = e.targetFor(PartOf);
    const rootId = root !== undefined ? (root as unknown as number) : -1;
    const rootPlayer = root?.get(Player);
    const color = playerColor(rootPlayer?.color ?? 0, opts.colorblind);
    const entry = ragdolls.get(rootId) ?? { color, parts: [], eyes: [] };
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    const angle = lerpAngle(prev.angle, t.angle, alpha);
    const shape = e.get(Shape) ?? { kind: ShapeKind.Box, hx: 0.07, hy: 0.18, r: 0.07 };
    if (part.part === RagdollParts.Torso) corpses.push({ x, y });
    if (part.part === RagdollParts.Head) {
      entry.parts.push(disk(x, y, FIGURE.headR * 0.95));
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const ex = x + c * 0.02 - s * 0.03;
      const ey = y + s * 0.02 + c * 0.03;
      const dx = c * 0.075;
      const dy = s * 0.075;
      entry.eyes.push(cap(ex - dx - c * 0.03, ey - dy - s * 0.03, ex - dx + c * 0.03, ey - dy + s * 0.03, 0.018));
      entry.eyes.push(cap(ex + dx - c * 0.03, ey + dy - s * 0.03, ex + dx + c * 0.03, ey + dy + s * 0.03, 0.018));
    } else {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const hy = shape.hy;
      const r = part.part === RagdollParts.Torso ? FIGURE.torsoR * 1.15 : shape.hx * 1.15;
      entry.parts.push(cap(x - s * -hy, y + c * -hy, x - s * hy, y + c * hy, r));
    }
    ragdolls.set(rootId, entry);
  });
  for (const r of ragdolls.values()) {
    groups.push(group(r.parts.slice(0, 16), shade(r.color, -0.08), Layer.Ragdolls, { blend: 'smoothUnion', smoothK: FIGURE.smoothK, style: 'shaded', pad: 0.4 }));
    if (r.eyes.length) groups.push(group(r.eyes, INK, Layer.Ragdolls, { style: 'flat', pad: 0.1 }));
  }

  // Particles are drawn straight from the pool by the renderers (see `particleQuad`); only the
  // glowing ones leave a mark here, as light emitters.
  if (particles) {
    const n = particles.count;
    const flags = particles.flags;
    for (let i = 0; i < n; i++) {
      if (flags[i]! & P_GLOW) lights.push({ x: particles.x[i]!, y: particles.y[i]!, radius: 1.8, r: 1, g: 0.7, b: 0.3, intensity: 0.45 });
    }
  }

  // Nobody left standing (double kill, winner died in the slow-mo): frame the bodies rather than empty arena.
  if (!opts.freezeCamera) updateCamera(cam, targets.length ? targets : corpses, ctx.level.bounds, viewW, viewH);
  const rs = world.get(RoundState);
  const ms = world.get(MatchState);
  const debug = opts.debug
    ? {
        bodies: [...ctx.bodies.entries()].map(([entity, body]) => {
          const p = body.getPosition();
          const sh = (entity as Entity).get?.(Shape);
          return { x: p.x, y: p.y, angle: body.getAngle(), hx: sh?.hx ?? 0.4, hy: sh?.hy ?? 0.4 };
        }),
        rays: [] as { x1: number; y1: number; x2: number; y2: number }[],
      }
    : undefined;

  const over = rs?.phase === RoundPhase.LastKill || rs?.phase === RoundPhase.Scoreboard || rs?.phase === RoundPhase.MatchOver;
  const roundWinner = over ? (rs?.winner ?? -1) : undefined;
  const countdownLeft = rs?.phase === RoundPhase.Countdown ? ctx.tuning.countdownTicks - (rs.ticks ?? 0) : 0;
  const winsArr = ms ? [ms.wins0, ms.wins1, ms.wins2, ms.wins3] : [0, 0, 0, 0];
  // The countdown always reads 3-2-1 however long it lasts: each numeral gets a third of it.
  const beat = Math.max(1, ctx.tuning.countdownTicks / 3);
  // Renderers draw groups in array order; a stable sort keeps within-layer ordering deterministic.
  groups.sort((a, b) => a.layer - b.layer);
  return {
    groups,
    camera: { x: cam.x, y: cam.y, zoom: cam.zoom, ppm: cam.zoom, shakeX: cam.shakeX, shakeY: cam.shakeY },
    theme: { top: theme.backgroundTop, bottom: theme.backgroundBottom, solid: theme.solid, vignette: theme.vignette },
    lights,
    debug,
    decalLayer: opts.decalLayer,
    particles,
    hud: {
      slowmo: rs?.phase === RoundPhase.LastKill,
      countdown: countdownLeft > 0 ? Math.ceil(countdownLeft / beat) : 0,
      countdownT: countdownLeft > 0 ? (countdownLeft % beat) / beat : 0,
      wins: winsArr,
      firstTo: ms?.firstTo ?? 0,
      showWins: (ms?.showWins ?? 1) === 1,
      phase: rs?.phase ?? 0,
      tick: ctx.tick,
      physicsMs: ctx.lastPhysicsMs,
      entities: ctx.bodies.size,
      flash: opts.flash ?? 0,
      players: hudPlayers,
      roundWinner,
      matchWinner: rs?.phase === RoundPhase.MatchOver ? winsArr.indexOf(Math.max(...winsArr)) : undefined,
      levelName: ctx.level.name,
    },
  };
}

function ownerOf(e: Entity): Entity | undefined {
  return e.targetFor(OwnedBy);
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
