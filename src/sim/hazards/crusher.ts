import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, PrevTransform, Transform } from '../traits';
import { createKinematicBox, kill } from './common';
import type { HazardModule } from './types';

/** PLAN Appendix D: crush = kill on overlap, including the swept AABB so 60 Hz cannot tunnel. */
export function crusherOverlaps(
  px: number,
  py: number,
  hx: number,
  hy: number,
  halfW: number,
  halfH: number,
  prevX = hx,
  prevY = hy,
): boolean {
  const minX = Math.min(prevX, hx) - halfW;
  const maxX = Math.max(prevX, hx) + halfW;
  const minY = Math.min(prevY, hy) - halfH;
  const maxY = Math.max(prevY, hy) + halfH;
  const pr = 0.3;
  const ph = 0.9;
  return px + pr >= minX && px - pr <= maxX && py + ph >= minY && py - ph <= maxY;
}

export const crusher: HazardModule = {
  typeId: 'crusher',
  kind: HazardKind.Crusher,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.Crusher),
  step(world, entity, hz) {
    const ctx = getContext(world);
    const t = Math.sin(ctx.tick / (hz.param0 || 50));
    const body = ctx.bodies.get(entity);
    if (body) body.setLinearVelocity(new Vec2(t * (hz.param1 || 4), 0));
  },
  contact(world, player, hz, ht, _ctrl, _dt, hazard) {
    const pt = player.get(Transform);
    if (!pt) return;
    const ctx = getContext(world);
    const prev = hazard.get(PrevTransform);
    const pprev = player.get(PrevTransform);
    const body = ctx.bodies.get(hazard);
    const pos = body?.getPosition();
    const lastX = prev?.x ?? ht.x;
    const lastY = prev?.y ?? ht.y;
    const bodyX = pos?.x ?? ht.x;
    const bodyY = pos?.y ?? ht.y;
    const halfW = hz.param2 || 0.75;
    const halfH = hz.param3 || 3;
    const samples = [
      [pt.x, pt.y],
      [pprev?.x ?? pt.x, pprev?.y ?? pt.y],
    ] as const;
    for (const [px, py] of samples) {
      if (
        crusherOverlaps(px, py, ht.x, ht.y, halfW, halfH, lastX, lastY) ||
        crusherOverlaps(px, py, bodyX, bodyY, halfW, halfH, ht.x, ht.y)
      ) {
        kill(world, player, pt.x, pt.y);
        return;
      }
    }
  },
};
