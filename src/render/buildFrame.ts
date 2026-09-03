import { lerp } from '../core/math';
import { getContext } from '../sim/context';
import { themeOf } from '../sim/level/themes';
import {
  Aim,
  Combat,
  Controller,
  Dead,
  Crown,
  Hazard,
  HazardKind,
  Held,
  HeldBy,
  MatchState,
  Player,
  PrevTransform,
  Projectile,
  RagdollPart,
  RoundPhase,
  RoundState,
  Transform,
  Weapon,
} from '../sim/traits';
import type { LightEmitter } from './gpu/lighting';
import { weaponByIndex } from '../sim/weapons/defs';
import type { SimHandle } from '../sim/world';
import { updateCamera, type CameraState } from './camera';
import type { PersistentDecalLayer } from './fx/decals';
import { FxLimb, type FxWorld } from './fx/world';
import type { Particle } from './fx/particles';
import { groupBounds, type RenderFrame, type ShapeGroup } from './frame';
import { poseToPrimitives, secondaryFromVelocity, type LimbState } from './figure';
import {
  PRIM_CAPSULE,
  PRIM_DISK,
  PRIM_PIE,
  PRIM_ROUNDED_BOX,
  PRIM_TRIANGLE,
} from './sdf/primitives';
import { PhysArm } from '../sim/traits';

const COLORS = ['#f2c14e', '#4c8dff', '#e85d4c', '#3dcf7a'];
const COLORS_CB = ['#f0e442', '#0072b2', '#d55e00', '#009e73'];
const limbs = new Map<number, LimbState>();

function nextLimb(fx: FxWorld | undefined, simId: number, vx: number, vy: number): LimbState {
  if (!fx) {
    const sec = limbs.get(simId) ?? { hipSway: 0, shoulderSway: 0 };
    const next = secondaryFromVelocity(sec, vx, vy);
    limbs.set(simId, next);
    return next;
  }
  let cur: LimbState = { hipSway: 0, shoulderSway: 0 };
  let updated = false;
  fx.query(FxLimb).updateEach(([l]) => {
    if (l.simId !== simId) return;
    cur = { hipSway: l.hipSway, shoulderSway: l.shoulderSway };
    const next = secondaryFromVelocity(cur, vx, vy);
    l.hipSway = next.hipSway;
    l.shoulderSway = next.shoulderSway;
    cur = next;
    updated = true;
  });
  if (!updated) {
    cur = secondaryFromVelocity(cur, vx, vy);
    fx.spawn(FxLimb({ simId, ...cur }));
  }
  return cur;
}

/** PLAN §4.11: spikes use triangles; saw teeth use `sdPie`; lava stays a rounded box. */
function hazardPrimitives(kind: number, x: number, y: number) {
  const body = { kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: 1.2, by: 0.35, r: 0.05 };
  if (kind === HazardKind.Spikes) {
    return [
      body,
      { kind: PRIM_TRIANGLE, ax: x - 0.45, ay: y + 0.15, bx: x - 0.2, by: y + 0.15, r: 0.45 },
      { kind: PRIM_TRIANGLE, ax: x - 0.05, ay: y + 0.15, bx: x + 0.2, by: y + 0.15, r: 0.45 },
      { kind: PRIM_TRIANGLE, ax: x + 0.35, ay: y + 0.15, bx: x + 0.6, by: y + 0.15, r: 0.45 },
    ];
  }
  if (kind === HazardKind.Saw) {
    return [
      { kind: PRIM_DISK, ax: x, ay: y, bx: x, by: y, r: 0.42 },
      { kind: PRIM_PIE, ax: x, ay: y, bx: 0.55, by: 0, r: 0.62 },
      { kind: PRIM_PIE, ax: x, ay: y + 0.02, bx: 0.55, by: 0, r: 0.62 },
    ];
  }
  return [body];
}

export type BuildFrameOpts = {
  debug?: boolean;
  freezeCamera?: boolean;
  colorblind?: boolean;
  decalLayer?: PersistentDecalLayer;
  flash?: number;
  fxWorld?: FxWorld;
};

export function buildFrame(
  sim: SimHandle,
  cam: CameraState,
  alpha: number,
  viewW: number,
  viewH: number,
  particles: Particle[],
  opts: BuildFrameOpts = {},
): RenderFrame {
  const world = sim.ecs;
  const ctx = getContext(world);
  const theme = themeOf(ctx.level.theme);
  const groups: ShapeGroup[] = [];
  const targets: { x: number; y: number }[] = [];
  const lights: LightEmitter[] = [];
  const palette = opts.colorblind ? COLORS_CB : COLORS;
  const physArms = new Map<
    number,
    { left?: { x: number; y: number }; right?: { x: number; y: number } }
  >();
  world.query(PhysArm, Transform).updateEach(([arm, at]) => {
    const rec = physArms.get(arm.owner) ?? {};
    if (arm.side < 0) rec.left = { x: at.x, y: at.y };
    else rec.right = { x: at.x, y: at.y };
    physArms.set(arm.owner, rec);
  });

  world.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    if (hz.kind === HazardKind.Lava) {
      lights.push({ x, y, radius: 4.5, r: 1, g: 0.35, b: 0.08, intensity: 0.9 });
    }
    const color = hz.kind === 4 ? theme.hazard : hz.kind === 3 ? '#222' : theme.solid;
    const fx = hz.kind === HazardKind.Lava ? ('lava' as const) : undefined;
    const primitives = hazardPrimitives(hz.kind, x, y);
    groups.push({
      ...groupBounds(primitives),
      color,
      blend: 'union',
      smoothK: 0,
      layer: 1,
      fx,
      primitives,
    });
    if (hz.kind === HazardKind.Laser && hz.armed >= 1) {
      const reach = hz.param3 || 14;
      groups.push({
        minX: x,
        minY: y - 0.08,
        maxX: x + reach,
        maxY: y + 0.08,
        color: hz.armed === 2 ? '#ffcc66' : '#ff3355',
        blend: 'union',
        smoothK: 0,
        layer: 7,
        primitives: [
          {
            kind: PRIM_CAPSULE,
            ax: x,
            ay: y,
            bx: x + reach,
            by: y,
            r: hz.armed === 2 ? 0.03 : 0.06,
          },
        ],
      });
    }
  });

  world.query(Weapon, Transform, PrevTransform).updateEach(([w, t, prev]) => {
    const def = weaponByIndex(w.defId);
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    groups.push({
      ...groupBounds([
        { kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: def.shape.length * 0.5, by: 0.08, r: 0.04 },
      ]),
      color: '#2b2b2b',
      blend: 'union',
      smoothK: 0,
      layer: 3,
      primitives: [
        { kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: def.shape.length * 0.5, by: 0.07, r: 0.03 },
      ],
    });
  });

  world.query(Projectile).updateEach(([p]) => {
    groups.push({
      minX: p.x - 0.2,
      minY: p.y - 0.2,
      maxX: p.x + 0.2,
      maxY: p.y + 0.2,
      color: '#fff4c2',
      blend: 'union',
      smoothK: 0,
      layer: 3,
      primitives: [
        {
          kind: PRIM_CAPSULE,
          ax: p.x,
          ay: p.y,
          bx: p.x + p.vx * 0.02,
          by: p.y + p.vy * 0.02,
          r: 0.06,
        },
      ],
    });
  });

  world.query(RagdollPart, Transform, PrevTransform).updateEach(([_r, t, prev]) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    groups.push({
      minX: x - 0.3,
      minY: y - 0.3,
      maxX: x + 0.3,
      maxY: y + 0.3,
      color: '#d8c38a',
      blend: 'smoothUnion',
      smoothK: 0.12,
      layer: 4,
      primitives: [{ kind: PRIM_CAPSULE, ax: x, ay: y, bx: x, by: y - 0.15, r: 0.08 }],
    });
  });

  world
    .query(Player, Transform, PrevTransform, Controller, Aim, Combat)
    .updateEach(([p, t, prev, ctrl, aim, combat], e) => {
      const x = lerp(prev.x, t.x, alpha);
      const y = lerp(prev.y, t.y, alpha);
      if (!e.has(Dead)) targets.push({ x, y });
      const next = nextLimb(opts.fxWorld, e, ctrl.vx, ctrl.vy);
      const arms = physArms.get(p.slot);
      const prims = poseToPrimitives(
        {
          x,
          y,
          facing: ctrl.facing,
          ducking: ctrl.ducking,
          grounded: ctrl.grounded,
          wallSliding: ctrl.wallSliding,
          vx: ctrl.vx,
          vy: ctrl.vy,
          aimX: aim.x,
          aimY: aim.y,
          punching: combat.punchActive > 0,
          blocking: combat.blocking,
          dead: e.has(Dead),
          phase: ctx.tick / 60,
          physicsArmL: arms?.left,
          physicsArmR: arms?.right,
        },
        next,
      );
      groups.push({
        ...groupBounds(prims, 0.5),
        color: palette[p.color % 4] ?? palette[0]!,
        blend: 'smoothUnion',
        smoothK: 0.16,
        layer: 5,
        primitives: prims,
      });
      if (e.has(Crown) && !e.has(Dead)) {
        groups.push({
          minX: x - 0.25,
          minY: y + 0.85,
          maxX: x + 0.25,
          maxY: y + 1.2,
          color: '#f2c14e',
          blend: 'union',
          smoothK: 0,
          layer: 7,
          primitives: [{ kind: PRIM_DISK, ax: x, ay: y + 1.02, bx: x, by: y + 1.02, r: 0.14 }],
        });
      }
      if (combat.blocking && !e.has(Dead)) {
        const arc = (ctx.tuning.blockArcDeg * Math.PI) / 180 / 2;
        const base = Math.atan2(aim.y, aim.x);
        const a0 = base - arc;
        const a1 = base + arc;
        groups.push({
          minX: x - 1.2,
          minY: y - 1.2,
          maxX: x + 1.2,
          maxY: y + 1.2,
          color: '#c8dcff',
          blend: 'union',
          smoothK: 0,
          layer: 7,
          primitives: [
            {
              kind: PRIM_CAPSULE,
              ax: x + Math.cos(a0) * 0.7,
              ay: y + Math.sin(a0) * 0.7,
              bx: x + Math.cos(a1) * 0.7,
              by: y + Math.sin(a1) * 0.7,
              r: 0.06,
            },
          ],
        });
      }
    });

  world.query(Weapon, Held).updateEach(([w], e) => {
    const def = weaponByIndex(w.defId);
    if (!def.laserSight) return;
    const holder = e.targetFor(HeldBy);
    if (!holder) return;
    const aim = holder.get(Aim);
    const t = holder.get(Transform);
    if (!aim || !t) return;
    groups.push({
      minX: t.x - 8,
      minY: t.y - 8,
      maxX: t.x + 8,
      maxY: t.y + 8,
      color: '#ff4d6d',
      blend: 'union',
      smoothK: 0,
      layer: 7,
      primitives: [
        {
          kind: PRIM_CAPSULE,
          ax: t.x,
          ay: t.y,
          bx: t.x + aim.x * 10,
          by: t.y + aim.y * 10,
          r: 0.02,
        },
      ],
    });
  });

  world.query(Projectile).updateEach(([p]) => {
    if (p.kind !== 6) return;
    groups.push({
      minX: p.x - (p.speed || 2),
      minY: p.y - (p.speed || 2),
      maxX: p.x + (p.speed || 2),
      maxY: p.y + (p.speed || 2),
      color: '#1a0a22',
      blend: 'union',
      smoothK: 0,
      layer: 6,
      fx: 'hole',
      primitives: [{ kind: PRIM_DISK, ax: p.x, ay: p.y, bx: p.x, by: p.y, r: 0.8 }],
    });
  });

  for (const d of ctx.level.decor ?? []) {
    const s = d.scale ?? 1;
    groups.push({
      minX: d.x - s,
      minY: d.y,
      maxX: d.x + s,
      maxY: d.y + 2 * s,
      color: theme.accent,
      blend: 'union',
      smoothK: 0,
      layer: 0,
      primitives: [
        { kind: PRIM_CAPSULE, ax: d.x, ay: d.y, bx: d.x, by: d.y + 1.6 * s, r: 0.12 * s },
      ],
    });
  }

  for (const part of particles) {
    if (part.color === '#fff4c2' || part.color.includes('ff')) {
      lights.push({ x: part.x, y: part.y, radius: 1.8, r: 1, g: 0.7, b: 0.3, intensity: 0.45 });
    }
    groups.push({
      minX: part.x - part.r,
      minY: part.y - part.r,
      maxX: part.x + part.r,
      maxY: part.y + part.r,
      color: part.color,
      blend: 'union',
      smoothK: 0,
      layer: 6,
      primitives: [{ kind: PRIM_DISK, ax: part.x, ay: part.y, bx: part.x, by: part.y, r: part.r }],
    });
  }

  if (!opts.freezeCamera) updateCamera(cam, targets, ctx.level.bounds, viewW, viewH);
  const rs = world.get(RoundState);
  const ms = world.get(MatchState);
  const debug = opts.debug
    ? {
        bodies: [...ctx.bodies.values()].map((body) => {
          const p = body.getPosition();
          return { x: p.x, y: p.y, angle: body.getAngle(), hx: 0.4, hy: 0.4 };
        }),
        rays: [] as { x1: number; y1: number; x2: number; y2: number }[],
      }
    : undefined;
  return {
    groups,
    camera: {
      x: cam.x,
      y: cam.y,
      zoom: cam.zoom,
      ppm: cam.zoom,
      shakeX: cam.shakeX,
      shakeY: cam.shakeY,
    },
    theme: { top: theme.backgroundTop, bottom: theme.backgroundBottom, solid: theme.solid },
    lights,
    debug,
    decalLayer: opts.decalLayer,
    hud: {
      slowmo: rs?.phase === RoundPhase.LastKill,
      countdown:
        rs?.phase === RoundPhase.Countdown
          ? Math.ceil((ctx.tuning.countdownTicks - (rs.ticks ?? 0)) / 60)
          : 0,
      wins: ms ? [ms.wins0, ms.wins1, ms.wins2, ms.wins3] : [0, 0, 0, 0],
      firstTo: ms?.firstTo ?? 0,
      showWins: (ms?.showWins ?? 1) === 1,
      phase: rs?.phase ?? 0,
      tick: ctx.tick,
      physicsMs: ctx.lastPhysicsMs,
      entities: ctx.bodies.size,
      flash: opts.flash ?? 0,
    },
  };
}
