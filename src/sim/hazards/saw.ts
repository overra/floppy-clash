import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, HazardPath, PrevTransform, Transform } from '../traits';
import { createKinematicCircle, kill, stepHazardPath } from './common';
import type { HazardModule } from './types';

/**
 * PLAN M4: swept kill disk so a 60 Hz tick cannot tunnel a player through a translating saw.
 * `reach` is the combined player+blade radius (same as the old point-sample nearKill).
 */
export function sawOverlaps(
  px: number,
  py: number,
  hx: number,
  hy: number,
  reach = 0.7,
  prevX = hx,
  prevY = hy,
): boolean {
  const dx = hx - prevX;
  const dy = hy - prevY;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-8) {
    t = Math.max(0, Math.min(1, ((px - prevX) * dx + (py - prevY) * dy) / len2));
  }
  const cx = prevX + dx * t;
  const cy = prevY + dy * t;
  const pr = 0.3;
  const ph = 0.9;
  return Math.abs(px - cx) < reach + pr && Math.abs(py - cy) < reach + ph;
}

export const saw: HazardModule = {
  typeId: 'saw',
  kind: HazardKind.Saw,
  create(world, obj) {
    const entity = createKinematicCircle(world, obj, HazardKind.Saw);
    if (obj.path && obj.path.length >= 2) {
      entity.add(
        HazardPath({
          points: obj.path.map((p) => ({ x: p.x, y: p.y })),
          index: 0,
          accum: 0,
          mode: obj.mode === 'loop' ? 0 : 1,
          dir: 1,
          speed: obj.speed ?? 3,
        }),
      );
    }
    return entity;
  },
  step(world, entity, hz, _tr) {
    const ctx = getContext(world);
    const body = ctx.bodies.get(entity);
    if (!body) return;
    body.setAngularVelocity(hz.param0 || 6);
    const dt = 1 / ctx.tuning.tickRate;
    if (entity.has(HazardPath)) {
      stepHazardPath(world, entity, dt);
      return;
    }
    if (hz.param1 > 0) {
      const homeX = hz.param2;
      const ox = Math.sin(ctx.tick / 40) * hz.param1;
      body.setLinearVelocity(new Vec2((homeX + ox - body.getPosition().x) / dt, 0));
    }
  },
  contact(world, player, _hz, ht, _ctrl, dt, hazard) {
    const pt = player.get(Transform);
    if (!pt) return;
    const ctx = getContext(world);
    const prev = hazard.get(PrevTransform);
    const pprev = player.get(PrevTransform);
    const body = ctx.bodies.get(hazard);
    const pos = body?.getPosition();
    const vel = body?.getLinearVelocity();
    const lastX = prev?.x ?? ht.x;
    const lastY = prev?.y ?? ht.y;
    const bodyX = pos?.x ?? ht.x;
    const bodyY = pos?.y ?? ht.y;
    const predX = bodyX + (vel?.x ?? 0) * dt;
    const predY = bodyY + (vel?.y ?? 0) * dt;
    const samples = [
      [pt.x, pt.y],
      [pprev?.x ?? pt.x, pprev?.y ?? pt.y],
    ] as const;
    for (const [px, py] of samples) {
      if (
        sawOverlaps(px, py, ht.x, ht.y, 0.7, lastX, lastY) ||
        sawOverlaps(px, py, bodyX, bodyY, 0.7, ht.x, ht.y) ||
        sawOverlaps(px, py, predX, predY, 0.7, bodyX, bodyY)
      ) {
        kill(world, player, pt.x, pt.y);
        return;
      }
    }
  },
};
