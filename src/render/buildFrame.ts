import { lerp, lerpAngle } from '../core/math';
import { ragdollPartSpec } from '../sim/player/ragdoll';
import { getContext } from '../sim/context';
import { themeOf } from '../sim/level/themes';
import {
  Aim,
  Combat,
  Controller,
  Dead,
  Crown,
  Destructible,
  Hazard,
  HazardKind,
  Held,
  HeldBy,
  MatchState,
  PhysArm,
  Player,
  PrevTransform,
  Projectile,
  RagdollPart,
  Snake,
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
  PRIM_BEZIER,
  PRIM_CAPSULE,
  PRIM_DISK,
  PRIM_PIE,
  PRIM_ROUNDED_BOX,
  PRIM_TRIANGLE,
  type Primitive,
} from './sdf/primitives';
import { themePassGroups } from './themeDecor';
import { weaponPrimitives } from './weaponSilhouette';

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

function crownPrimitives(x: number, y: number): Primitive[] {
  const cy = y + 1.05;
  return [
    { kind: PRIM_ROUNDED_BOX, ax: x, ay: cy, bx: 0.22, by: 0.045, r: 0.012 },
    { kind: PRIM_TRIANGLE, ax: x - 0.2, ay: cy + 0.04, bx: x - 0.08, by: cy + 0.04, r: 0.16 },
    { kind: PRIM_TRIANGLE, ax: x - 0.06, ay: cy + 0.04, bx: x + 0.06, by: cy + 0.04, r: 0.2 },
    { kind: PRIM_TRIANGLE, ax: x + 0.08, ay: cy + 0.04, bx: x + 0.2, by: cy + 0.04, r: 0.16 },
    { kind: PRIM_DISK, ax: x, ay: cy + 0.02, bx: x, by: cy + 0.02, r: 0.04 },
  ];
}

function bodyHalfSize(
  ctx: ReturnType<typeof getContext>,
  e: unknown,
): { hx: number; hy: number } | null {
  const body = ctx.bodies.get(e as number);
  const fix = body?.getFixtureList();
  if (!fix) return null;
  const aabb = fix.getAABB(0);
  const hx = (aabb.upperBound.x - aabb.lowerBound.x) * 0.5;
  const hy = (aabb.upperBound.y - aabb.lowerBound.y) * 0.5;
  if (!Number.isFinite(hx) || !Number.isFinite(hy) || hx < 0.05 || hy < 0.05) return null;
  return { hx, hy };
}

/** PLAN §4.11: spikes use triangles; saw teeth use `sdPie`; lava stays a rounded box. */
function hazardPrimitives(kind: number, x: number, y: number, hx = 1.2, hy = 0.35) {
  const body = { kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: hx, by: hy, r: 0.05 };
  if (kind === HazardKind.Spikes) {
    return [
      body,
      { kind: PRIM_TRIANGLE, ax: x - 0.45, ay: y + 0.15, bx: x - 0.2, by: y + 0.15, r: 0.45 },
      { kind: PRIM_TRIANGLE, ax: x - 0.05, ay: y + 0.15, bx: x + 0.2, by: y + 0.15, r: 0.45 },
      { kind: PRIM_TRIANGLE, ax: x + 0.35, ay: y + 0.15, bx: x + 0.6, by: y + 0.15, r: 0.45 },
    ];
  }
  if (kind === HazardKind.Saw) {
    const teeth = 8;
    const pies = Array.from({ length: teeth }, (_, i) => ({
      kind: PRIM_PIE,
      ax: x,
      ay: y,
      bx: 0.22,
      by: (i / teeth) * Math.PI * 2,
      r: 0.64,
    }));
    return [{ kind: PRIM_DISK, ax: x, ay: y, bx: x, by: y, r: 0.36 }, ...pies];
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
  const groups: ShapeGroup[] = themePassGroups(theme, ctx.level.bounds, cam, viewW, viewH);
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

  world.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev], e) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    if (hz.kind === HazardKind.Lava) {
      lights.push({ x, y, radius: 4.5, r: 1, g: 0.35, b: 0.08, intensity: 0.9 });
    }
    let color = hz.kind === 4 ? theme.hazard : hz.kind === 3 ? '#222' : theme.solid;
    if (hz.kind === HazardKind.Disappearing && hz.armed === 2 && ctx.tick % 8 < 4) {
      color = '#ffcc66';
    }
    const fx = hz.kind === HazardKind.Lava ? ('lava' as const) : undefined;
    const size = bodyHalfSize(ctx, e);
    const primitives = hazardPrimitives(hz.kind, x, y, size?.hx ?? 1.2, size?.hy ?? 0.35);
    const dest = e.get(Destructible);
    if (dest && dest.hp < dest.maxHp) {
      const cracks = Math.min(3, 1 + Math.floor((1 - dest.hp / dest.maxHp) * 3));
      for (let i = 0; i < cracks; i++) {
        primitives.push({
          kind: PRIM_CAPSULE,
          ax: x - 0.25 + i * 0.12,
          ay: y - 0.15,
          bx: x + 0.2 - i * 0.08,
          by: y + 0.18,
          r: 0.025,
        });
      }
    }
    const cracked = dest !== undefined && dest.hp < dest.maxHp;
    groups.push({
      ...groupBounds(primitives),
      color,
      blend: cracked ? 'subtract' : 'union',
      smoothK: cracked ? 0.05 : 0,
      layer: hz.kind === HazardKind.Solid ? 1 : 2,
      fx,
      primitives,
    });
    if (hz.kind === HazardKind.Laser && hz.armed >= 1) {
      const reach = hz.param3 || 14;
      const ang = t.angle;
      const x2 = x + Math.cos(ang) * reach;
      const y2 = y + Math.sin(ang) * reach;
      groups.push({
        minX: Math.min(x, x2) - 0.1,
        minY: Math.min(y, y2) - 0.1,
        maxX: Math.max(x, x2) + 0.1,
        maxY: Math.max(y, y2) + 0.1,
        color: hz.armed === 2 ? '#ffcc66' : '#ff3355',
        blend: 'union',
        smoothK: 0,
        layer: 7,
        primitives: [
          {
            kind: PRIM_CAPSULE,
            ax: x,
            ay: y,
            bx: x2,
            by: y2,
            r: hz.armed === 2 ? 0.03 : 0.06,
          },
        ],
      });
    }
  });

  const heldByEntity = new Map<
    object,
    { x: number; y: number; length: number; kind: string; angle: number }
  >();
  world.query(Weapon, Held, Transform).updateEach(([w, t], we) => {
    const holder = we.targetFor(HeldBy);
    if (!holder) return;
    const def = weaponByIndex(w.defId);
    const prev = we.get(PrevTransform) ?? t;
    const aim = holder.get(Aim);
    heldByEntity.set(holder, {
      x: lerp(prev.x, t.x, alpha),
      y: lerp(prev.y, t.y, alpha),
      length: def.shape.length,
      kind: def.shape.kind,
      angle: aim ? Math.atan2(aim.y, aim.x) : t.angle,
    });
  });

  world.query(Weapon, Transform).updateEach(([w, t], e) => {
    if (e.has(Held)) return;
    const def = weaponByIndex(w.defId);
    const prev = e.get(PrevTransform) ?? t;
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    const angle = lerpAngle(prev.angle, t.angle, alpha);
    const prims = weaponPrimitives(x, y, def.shape.length, def.shape.kind, angle);
    groups.push({
      ...groupBounds(prims),
      color: '#2b2b2b',
      blend: 'union',
      smoothK: 0,
      layer: 3,
      primitives: prims,
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
        {
          kind: PRIM_BEZIER,
          ax: p.x - p.vx * 0.045,
          ay: p.y - p.vy * 0.045,
          bx: p.x,
          by: p.y,
          r: 0.04,
          cx: p.x - p.vx * 0.02 + p.vy * 0.012,
          cy: p.y - p.vy * 0.02 - p.vx * 0.012,
        },
      ],
    });
  });

  world.query(RagdollPart, Transform, PrevTransform).updateEach(([r, t, prev]) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    const angle = lerpAngle(prev.angle, t.angle, alpha);
    const spec = ragdollPartSpec(r.part);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const primitives = spec.circle
      ? [{ kind: PRIM_DISK, ax: x, ay: y, bx: x, by: y, r: spec.hx }]
      : [
          {
            kind: PRIM_CAPSULE,
            ax: x - spec.hy * s,
            ay: y + spec.hy * c,
            bx: x + spec.hy * s,
            by: y - spec.hy * c,
            r: spec.hx,
          },
        ];
    groups.push({
      minX: x - 0.45,
      minY: y - 0.45,
      maxX: x + 0.45,
      maxY: y + 0.45,
      color: '#d8c38a',
      blend: 'smoothUnion',
      smoothK: 0.12,
      layer: 4,
      primitives,
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
      const held = heldByEntity.get(e);
      if (held) {
        prims.push(...weaponPrimitives(held.x, held.y, held.length, held.kind, held.angle));
      }
      groups.push({
        ...groupBounds(prims, 0.5),
        color: palette[p.color % 4] ?? palette[0]!,
        blend: 'smoothUnion',
        smoothK: 0.16,
        layer: 5,
        primitives: prims,
      });
      if (e.has(Crown) && !e.has(Dead)) {
        const jewels = crownPrimitives(x, y);
        groups.push({
          ...groupBounds(jewels, 0.15),
          color: '#f2c14e',
          blend: 'union',
          smoothK: 0,
          layer: 7,
          primitives: jewels,
        });
      }
      if (combat.blocking && !e.has(Dead)) {
        const arc = (ctx.tuning.blockArcDeg * Math.PI) / 180 / 2;
        const base = Math.atan2(aim.y, aim.x);
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
              kind: PRIM_PIE,
              ax: x,
              ay: y,
              bx: arc,
              by: base - Math.PI / 2,
              r: 0.75,
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

  world.query(Snake, Transform).updateEach(([_s, t]) => {
    groups.push({
      ...groupBounds([
        {
          kind: PRIM_BEZIER,
          ax: t.x - 0.35,
          ay: t.y,
          bx: t.x + 0.35,
          by: t.y,
          r: 0.1,
          cx: t.x,
          cy: t.y + 0.28,
        },
      ]),
      color: '#3dcf7a',
      blend: 'union',
      smoothK: 0,
      layer: 3,
      primitives: [
        {
          kind: PRIM_BEZIER,
          ax: t.x - 0.35,
          ay: t.y,
          bx: t.x + 0.35,
          by: t.y,
          r: 0.1,
          cx: t.x,
          cy: t.y + 0.28,
        },
      ],
    });
  });

  const hole = { x: 0, y: 0, r: 0 };
  world.query(Projectile).updateEach(([p]) => {
    if (p.kind !== 6) return;
    const def = weaponByIndex(p.defId);
    if (def.id !== 'black-hole') return;
    const life = 180;
    const age = Math.max(0, life - Math.max(p.fuse, 0));
    const radius = Math.max(0.8, (def.projectile.radius || 4.5) * (0.2 + 0.8 * Math.min(1, age / life)));
    hole.x = p.x;
    hole.y = p.y;
    hole.r = radius;
    groups.push({
      minX: p.x - radius,
      minY: p.y - radius,
      maxX: p.x + radius,
      maxY: p.y + radius,
      color: '#1a0a22',
      blend: 'union',
      smoothK: 0,
      layer: 6,
      fx: 'hole',
      primitives: [{ kind: PRIM_DISK, ax: p.x, ay: p.y, bx: p.x, by: p.y, r: radius * 0.35 }],
    });
  });

  for (const d of ctx.level.decor ?? []) {
    const s = d.scale ?? 1;
    const vine = d.kind === 'vine' || d.kind === 'rope' || d.kind === 'trail';
    const prims = vine
      ? [
          {
            kind: PRIM_BEZIER,
            ax: d.x,
            ay: d.y + 1.8 * s,
            bx: d.x + 0.8 * s,
            by: d.y,
            r: 0.07 * s,
            cx: d.x - 0.7 * s,
            cy: d.y + 0.9 * s,
          },
        ]
      : [{ kind: PRIM_CAPSULE, ax: d.x, ay: d.y, bx: d.x, by: d.y + 1.6 * s, r: 0.12 * s }];
    groups.push({
      ...groupBounds(prims, 0.4),
      color: theme.accent,
      blend: 'union',
      smoothK: 0,
      layer: 0,
      primitives: prims,
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
    hole: hole.r > 0 ? { x: hole.x, y: hole.y, r: hole.r } : undefined,
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
