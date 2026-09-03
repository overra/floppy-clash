import { getContext } from '../context';
import { raycastClosest } from '../physics/queries';
import { Dead, HazardKind, Player, PrevTransform, Static, Transform } from '../traits';
import { spawnHazardEntity, kill } from './common';
import type { HazardModule } from './types';

function dirAngle(dir?: string): number {
  if (dir === 'up') return Math.PI / 2;
  if (dir === 'down') return -Math.PI / 2;
  if (dir === 'left') return Math.PI;
  return 0;
}

/** Segment intersection; null if they do not overlap. */
export function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { x: number; y: number } | null {
  const den = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);
  if (Math.abs(den) < 1e-8) return null;
  const t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / den;
  const u = ((ax - cx) * (ay - by) - (ay - cy) * (ax - bx)) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * (bx - ax), y: ay + t * (by - ay) };
}

/**
 * Closest points on two finite segments (Ericson). `ax/ay` is on
 * segment AB; `bx/by` is on CD.
 */
export function closestPointsOnSegments(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { ax: number; ay: number; bx: number; by: number; dist: number } {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const rx = ax - cx;
  const ry = ay - cy;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  const eps = 1e-10;
  let s = 0;
  let t = 0;
  if (a > eps || e > eps) {
    if (a <= eps) {
      t = Math.max(0, Math.min(1, f / e));
    } else {
      const c = d1x * rx + d1y * ry;
      if (e <= eps) {
        s = Math.max(0, Math.min(1, -c / a));
      } else {
        const b = d1x * d2x + d1y * d2y;
        const denom = a * e - b * b;
        s = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = Math.max(0, Math.min(1, -c / a));
        } else if (t > 1) {
          t = 1;
          s = Math.max(0, Math.min(1, (b - c) / a));
        }
      }
    }
  }
  const px = ax + s * d1x;
  const py = ay + s * d1y;
  const qx = cx + t * d2x;
  const qy = cy + t * d2y;
  return { ax: px, ay: py, bx: qx, by: qy, dist: Math.hypot(px - qx, py - qy) };
}

/** Upright stadium (axis ±(halfH−radius), radius) vs a beam segment. */
function capsuleHitsBeam(
  px: number,
  py: number,
  lx0: number,
  ly0: number,
  lx1: number,
  ly1: number,
  radius: number,
  halfH: number,
): { x: number; y: number } | null {
  const axis = Math.max(0, halfH - radius);
  const hit = closestPointsOnSegments(px, py - axis, px, py + axis, lx0, ly0, lx1, ly1);
  if (hit.dist <= radius + 1e-6) return { x: hit.bx, y: hit.by };
  return null;
}

/**
 * PLAN M4: a player who crosses the beam between samples still dies.
 * Appendix D keeps the on-tick ray; this is a capsule-vs-segment test
 * (half-width `radius`, half-height `halfH`) so a 60 Hz skip cannot
 * tunnel the 1.8 m body the way a point-radius miss would. Closest-
 * point-to-emitter alone also misses a far-end graze. Mid-path uses
 * the closest approach of the center segment, then a capsule there,
 * so a skip that only clips the beam end still counts.
 */
export function playerCrossesBeam(
  px0: number,
  py0: number,
  px1: number,
  py1: number,
  lx0: number,
  ly0: number,
  lx1: number,
  ly1: number,
  radius = 0.35,
  halfH = 0.9,
): { x: number; y: number } | null {
  const hit = segmentsIntersect(px0, py0, px1, py1, lx0, ly0, lx1, ly1);
  if (hit) return hit;
  const at0 = capsuleHitsBeam(px0, py0, lx0, ly0, lx1, ly1, radius, halfH);
  if (at0) return at0;
  const at1 = capsuleHitsBeam(px1, py1, lx0, ly0, lx1, ly1, radius, halfH);
  if (at1) return at1;
  const mid = closestPointsOnSegments(px0, py0, px1, py1, lx0, ly0, lx1, ly1);
  return capsuleHitsBeam(mid.ax, mid.ay, lx0, ly0, lx1, ly1, radius, halfH);
}

/** Appendix D: raycast each tick while on; warning then beam. */
export const laser: HazardModule = {
  typeId: 'laser',
  kind: HazardKind.Laser,
  create(world, obj) {
    const entity = spawnHazardEntity(world, obj, HazardKind.Laser);
    entity.add(Static());
    const t = entity.get(Transform);
    if (t) entity.set(Transform, { ...t, angle: obj.angle ?? dirAngle(obj.dir) });
    return entity;
  },
  step(world, entity, hz, tr) {
    const ctx = getContext(world);
    const on = hz.param0 || 40;
    const off = hz.param1 || 50;
    const warn = hz.param2;
    const cycle = on + off;
    const phase = ctx.tick % cycle;
    if (phase < warn) hz.armed = 2;
    else if (phase < on) hz.armed = 1;
    else hz.armed = 0;

    if (hz.armed !== 1) return;
    const reach = hz.param3 || 14;
    const ang = tr.angle;
    const x2 = tr.x + Math.cos(ang) * reach;
    const y2 = tr.y + Math.sin(ang) * reach;
    const ignore = (h: { entity: number; kind: string }) => {
      if (h.entity === (entity as unknown as number)) return true;
      if (h.kind === 'sensor' || h.kind === 'projectile') return true;
      return false;
    };
    const hit = raycastClosest(world, tr.x, tr.y, x2, y2, ignore);
    if (hit) {
      const target = hit.entity as typeof entity;
      if (world.has(target) && target.has(Player) && !target.has(Dead)) {
        kill(world, target, hit.x, hit.y);
        return;
      }
    }

    const dt = 1 / ctx.tuning.tickRate;
    world.query(Player, Transform).updateEach(([_p, pt], player) => {
      if (player.has(Dead)) return;
      const prev = player.get(PrevTransform);
      const body = ctx.bodies.get(player);
      const pos = body?.getPosition();
      const vel = body?.getLinearVelocity();
      const lastX = prev?.x ?? pt.x;
      const lastY = prev?.y ?? pt.y;
      const bodyX = pos?.x ?? pt.x;
      const bodyY = pos?.y ?? pt.y;
      const predX = bodyX + (vel?.x ?? 0) * dt;
      const predY = bodyY + (vel?.y ?? 0) * dt;
      const hw = ctx.tuning.radius + 0.05;
      const hh = ctx.tuning.height * 0.5;
      const paths = [
        [lastX, lastY, pt.x, pt.y],
        [pt.x, pt.y, bodyX, bodyY],
        [bodyX, bodyY, predX, predY],
      ] as const;
      for (const [ax, ay, bx, by] of paths) {
        const cross = playerCrossesBeam(ax, ay, bx, by, tr.x, tr.y, x2, y2, hw, hh);
        if (!cross) continue;
        const block = raycastClosest(world, tr.x, tr.y, cross.x, cross.y, ignore);
        if (block && block.kind !== 'player') {
          const toBlock = Math.hypot(block.x - tr.x, block.y - tr.y);
          const toCross = Math.hypot(cross.x - tr.x, cross.y - tr.y);
          if (toBlock < toCross - 0.05) continue;
        }
        kill(world, player, cross.x, cross.y);
        return;
      }
    });
  },
};
