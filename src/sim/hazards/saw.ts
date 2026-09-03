import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, PrevTransform, Transform } from '../traits';
import { createKinematicCircle, kill } from './common';
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
  create: (world, obj) => createKinematicCircle(world, obj, HazardKind.Saw),
  step(world, entity, hz, tr) {
    const ctx = getContext(world);
    const body = ctx.bodies.get(entity);
    if (!body) return;
    body.setAngularVelocity(hz.param0 || 6);
    if (hz.param1 > 0) {
      const dt = 1 / ctx.tuning.tickRate;
      const ox = Math.sin(ctx.tick / 40) * hz.param1;
      body.setLinearVelocity(new Vec2((tr.x + ox - body.getPosition().x) / dt, 0));
    }
  },
  contact(world, player, _hz, ht, _ctrl, _dt, hazard) {
    const pt = player.get(Transform);
    if (!pt) return;
    const prev = hazard.get(PrevTransform);
    if (sawOverlaps(pt.x, pt.y, ht.x, ht.y, 0.7, prev?.x ?? ht.x, prev?.y ?? ht.y)) {
      kill(world, player, pt.x, pt.y);
    }
  },
};
