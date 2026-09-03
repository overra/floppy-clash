import { Vec2 } from 'planck';
import { authoredHalfWidth } from '../authored';
import { getContext } from '../context';
import { takeDamage } from '../player/health';
import { HazardKind, PrevTransform, Transform } from '../traits';
import { createKinematicBox, lavaTouch } from './common';
import type { HazardModule } from './types';

function segmentHitsAabb(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): boolean {
  if (ax >= minX && ax <= maxX && ay >= minY && ay <= maxY) return true;
  if (bx >= minX && bx <= maxX && by >= minY && by <= maxY) return true;
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, ax - minX) && clip(dx, maxX - ax) && clip(-dy, ay - minY) && clip(dy, maxY - ay);
}

/**
 * PLAN M4: last→now player segment vs last→now lava AABB.
 * Current-pose `dx` / `y` gates miss a 60 Hz pass through rising lava.
 */
export function lavaSweepsPlayer(
  px: number,
  py: number,
  lastPx: number,
  lastPy: number,
  hx: number,
  hy: number,
  lastHx = hx,
  lastHy = hy,
  reachX = 0,
): boolean {
  // reachX is authored half-width. 0 means no reach — do not `|| 4`.
  if (reachX <= 0) return false;
  const minX = Math.min(lastHx, hx) - reachX;
  const maxX = Math.max(lastHx, hx) + reachX;
  const minY = Math.min(lastHy, hy) - 1;
  const maxY = Math.max(lastHy, hy) + 0.6;
  return segmentHitsAabb(lastPx, lastPy, px, py, minX, maxX, minY, maxY);
}

export const lava: HazardModule = {
  typeId: 'lava',
  kind: HazardKind.Lava,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.Lava, { sensor: true, friction: 0.4, tag: false }),
  step(world, entity, hz, tr, dt) {
    if (hz.param0 !== 0) tr.y += hz.param0 * dt;
    const body = getContext(world).bodies.get(entity);
    if (body) body.setPosition(new Vec2(tr.x, tr.y));
  },
  contact(world, player, hz, ht, _ctrl, _dt, hazard) {
    const ctx = getContext(world);
    if (ctx.holdHazards) return;
    const pt = player.get(Transform);
    if (!pt) return;
    const prev = player.get(PrevTransform);
    const hprev = hazard.get(PrevTransform);
    const lastX = prev?.x ?? pt.x;
    const lastY = prev?.y ?? pt.y;
    const lavaLastX = hprev?.x ?? ht.x;
    const lavaLastY = hprev?.y ?? ht.y;
    // param1 is authored full width. Sweep margin is half-width — `reachX = param1`
    // doubles the bed on each side. 0 means no reach.
    if (
      !lavaSweepsPlayer(
        pt.x,
        pt.y,
        lastX,
        lastY,
        ht.x,
        ht.y,
        lavaLastX,
        lavaLastY,
        authoredHalfWidth(hz.param1),
      )
    ) {
      return;
    }
    const last = lavaTouch.get(player) ?? -999;
    if (ctx.tick - last >= ctx.tuning.lavaCooldownTicks) {
      takeDamage(world, player, ctx.tuning.lavaDamage, 'body', -1, pt.x, pt.y);
      lavaTouch.set(player, ctx.tick);
      const body = ctx.bodies.get(player);
      if (body) {
        const v = body.getLinearVelocity();
        body.setLinearVelocity(new Vec2(v.x, v.y + 8));
      }
    }
  },
};
