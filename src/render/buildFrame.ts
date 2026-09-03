import { lerp } from '../core/math';
import { getContext } from '../sim/context';
import { themeOf } from '../sim/level/themes';
import {
  Aim,
  Combat,
  Controller,
  Dead,
  Hazard,
  Player,
  PrevTransform,
  Projectile,
  RagdollPart,
  RoundPhase,
  RoundState,
  Transform,
  Weapon,
} from '../sim/traits';
import { weaponByIndex } from '../sim/weapons/defs';
import type { SimHandle } from '../sim/world';
import { updateCamera, type CameraState } from './camera';
import type { Particle } from './fx/particles';
import { groupBounds, type RenderFrame, type ShapeGroup } from './frame';
import { poseToPrimitives, secondaryFromVelocity, type LimbState } from './figure';
import { PRIM_CAPSULE, PRIM_DISK, PRIM_ROUNDED_BOX } from './sdf/primitives';

const COLORS = ['#f2c14e', '#4c8dff', '#e85d4c', '#3dcf7a'];
const limbs = new Map<number, LimbState>();

export function buildFrame(
  sim: SimHandle,
  cam: CameraState,
  alpha: number,
  viewW: number,
  viewH: number,
  particles: Particle[],
): RenderFrame {
  const world = sim.ecs;
  const ctx = getContext(world);
  const theme = themeOf(ctx.level.theme);
  const groups: ShapeGroup[] = [];
  const targets: { x: number; y: number }[] = [];

  world.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    const color = hz.kind === 4 ? theme.hazard : hz.kind === 3 ? '#222' : theme.solid;
    groups.push({
      ...groupBounds([{ kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: 1, by: 0.4, r: 0.08 }]),
      color,
      blend: 'union',
      smoothK: 0,
      layer: 1,
      primitives: [{ kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: 1.2, by: 0.35, r: 0.05 }],
    });
  });

  world.query(Weapon, Transform, PrevTransform).updateEach(([w, t, prev]) => {
    const def = weaponByIndex(w.defId);
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    groups.push({
      ...groupBounds([{ kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: def.shape.length * 0.5, by: 0.08, r: 0.04 }]),
      color: '#2b2b2b',
      blend: 'union',
      smoothK: 0,
      layer: 3,
      primitives: [{ kind: PRIM_ROUNDED_BOX, ax: x, ay: y, bx: def.shape.length * 0.5, by: 0.07, r: 0.03 }],
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
      primitives: [{ kind: PRIM_CAPSULE, ax: p.x, ay: p.y, bx: p.x + p.vx * 0.02, by: p.y + p.vy * 0.02, r: 0.06 }],
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

  world.query(Player, Transform, PrevTransform, Controller, Aim, Combat).updateEach(([p, t, prev, ctrl, aim, combat], e) => {
    const x = lerp(prev.x, t.x, alpha);
    const y = lerp(prev.y, t.y, alpha);
    if (!e.has(Dead)) targets.push({ x, y });
    const sec = limbs.get(e) ?? { hipSway: 0, shoulderSway: 0 };
    const next = secondaryFromVelocity(sec, ctrl.vx, ctrl.vy);
    limbs.set(e, next);
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
      },
      next,
    );
    groups.push({
      ...groupBounds(prims, 0.5),
      color: COLORS[p.color % 4] ?? COLORS[0]!,
      blend: 'smoothUnion',
      smoothK: 0.16,
      layer: 5,
      primitives: prims,
    });
  });

  for (const part of particles) {
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

  updateCamera(cam, targets, ctx.level.bounds, viewW, viewH);
  const rs = world.get(RoundState);
  return {
    groups,
    camera: { x: cam.x, y: cam.y, zoom: cam.zoom, ppm: cam.zoom, shakeX: cam.shakeX, shakeY: cam.shakeY },
    theme: { top: theme.backgroundTop, bottom: theme.backgroundBottom, solid: theme.solid },
    hud: {
      slowmo: rs?.phase === RoundPhase.LastKill,
      countdown: rs?.phase === RoundPhase.Countdown ? Math.ceil((180 - (rs.ticks ?? 0)) / 60) : 0,
    },
  };
}
