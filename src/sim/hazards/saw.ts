import { Vec2 } from 'planck';
import { getContext } from '../context';
import { readBodyShape } from '../physics/bodies';
import { HazardKind, HazardPath, PrevTransform, Transform } from '../traits';
import { createKinematicCircle, diskSweepsPlayer, kill, stepHazardPath } from './common';
import type { HazardModule } from './types';

/** PLAN M4: swept kill disk so a 60 Hz tick cannot tunnel a player through a translating saw. */
export function sawOverlaps(
  px: number,
  py: number,
  hx: number,
  hy: number,
  reach = 0.7,
  prevX = hx,
  prevY = hy,
): boolean {
  return diskSweepsPlayer(px, py, hx, hy, reach, prevX, prevY);
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
    // param0 is authored omega (default 6 in paramsFromObject). 0 means frozen —
    // do not `|| 6` or a last-tick freeze becomes a 6 rad/s this-tick drive.
    body.setAngularVelocity(hz.param0);
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
  contact(world, player, _hz, ht, _ctrl, _dt, hazard) {
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
    // Radius lives on the fixture (omega/speed/home occupy Hazard params).
    // Missing / r: 0 is 0 — do not `|| 0.7` or a skinny/zero saw keeps the old disk.
    const shape = body ? readBodyShape(body) : null;
    const reach = shape?.circle === 1 ? shape.radius : 0;
    const samples = [
      [pt.x, pt.y],
      [pprev?.x ?? pt.x, pprev?.y ?? pt.y],
    ] as const;
    for (const [px, py] of samples) {
      if (
        sawOverlaps(px, py, ht.x, ht.y, reach, lastX, lastY) ||
        sawOverlaps(px, py, bodyX, bodyY, reach, ht.x, ht.y)
      ) {
        kill(world, player, pt.x, pt.y);
        return;
      }
    }
  },
};
