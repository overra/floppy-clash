import { getContext } from '../context';
import { Anchor, HazardKind, Transform } from '../traits';
import { anchorOf, createKinematicBox, kill, steerTo } from './common';
import type { HazardModule } from './types';

/**
 * Ceiling slammer. Rests at its authored position, drops `param1` metres in a tenth of the
 * `param0`-tick cycle, sits, then climbs back. param2 = phase offset. Anything under the face
 * while it is down or descending is flattened.
 */
export const crusher: HazardModule = {
  typeId: 'crusher',
  kind: HazardKind.Crusher,
  create(world, obj) {
    const e = createKinematicBox(world, obj, HazardKind.Crusher);
    e.add(Anchor({ x: obj.x, y: obj.y }));
    return e;
  },
  step(world, entity, hz, tr) {
    const ctx = getContext(world);
    const home = anchorOf(entity, tr);
    const period = Math.max(30, hz.param0 || 150);
    const drop = hz.param1 || 3;
    const p = ((ctx.tick + hz.param2) % period) / period;
    let k = 0;
    if (p < 0.45) k = 0;
    else if (p < 0.55) k = (p - 0.45) / 0.1;
    else if (p < 0.7) k = 1;
    else k = 1 - (p - 0.7) / 0.3;
    // armed while slamming or sitting at the bottom
    hz.armed = p >= 0.45 && p < 0.7 ? 1 : 0;
    steerTo(world, entity, home.x, home.y - drop * k);
  },
  contact(world, player, hz, ht, _ctrl, _dt, hazard) {
    if (!hz.armed) return;
    const pt = player.get(Transform);
    if (!pt) return;
    const ctx = getContext(world);
    const body = ctx.bodies.get(hazard);
    const fixture = body?.getFixtureList();
    const aabb = fixture?.getAABB(0);
    const halfW = aabb ? (aabb.upperBound.x - aabb.lowerBound.x) / 2 : 1;
    const bottom = aabb ? aabb.lowerBound.y : ht.y - 1;
    if (Math.abs(pt.x - ht.x) < halfW + 0.1 && pt.y < bottom + 0.3 && pt.y > bottom - 1.15) {
      kill(world, player, pt.x, pt.y);
    }
  },
};
