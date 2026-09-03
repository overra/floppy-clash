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
 * PLAN M4: a player who crosses the beam between samples still dies.
 * Appendix D keeps the on-tick ray; this is the player-path sweep so 60 Hz
 * cannot skip the kill line the way a fast body tunnels a saw.
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
): { x: number; y: number } | null {
  const hit = segmentsIntersect(px0, py0, px1, py1, lx0, ly0, lx1, ly1);
  if (hit) return hit;
  const dx = px1 - px0;
  const dy = py1 - py0;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-8) {
    t = Math.max(0, Math.min(1, ((lx0 - px0) * dx + (ly0 - py0) * dy) / len2));
  }
  const qx = px0 + dx * t;
  const qy = py0 + dy * t;
  const beamDx = lx1 - lx0;
  const beamDy = ly1 - ly0;
  const b2 = beamDx * beamDx + beamDy * beamDy;
  let s = 0;
  if (b2 > 1e-8) {
    s = Math.max(0, Math.min(1, ((qx - lx0) * beamDx + (qy - ly0) * beamDy) / b2));
  }
  const bx = lx0 + beamDx * s;
  const by = ly0 + beamDy * s;
  if (Math.hypot(qx - bx, qy - by) < radius) return { x: bx, y: by };
  return null;
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
      const paths = [
        [lastX, lastY, pt.x, pt.y],
        [pt.x, pt.y, bodyX, bodyY],
        [bodyX, bodyY, predX, predY],
      ] as const;
      for (const [ax, ay, bx, by] of paths) {
        const cross = playerCrossesBeam(ax, ay, bx, by, tr.x, tr.y, x2, y2);
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
