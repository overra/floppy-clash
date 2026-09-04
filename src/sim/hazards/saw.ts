import { getContext } from '../context';
import { Anchor, HazardKind, Transform } from '../traits';
import { anchorOf, createKinematicCircle, nearKill, steerTo } from './common';
import type { HazardModule } from './types';

/** param0 = spin rad/s, param1 = horizontal sweep half-extent, param2 = sweep speed, param3 = phase. */
export const saw: HazardModule = {
  typeId: 'saw',
  kind: HazardKind.Saw,
  create(world, obj) {
    const e = createKinematicCircle(world, obj, HazardKind.Saw);
    e.add(Anchor({ x: obj.x, y: obj.y }));
    return e;
  },
  step(world, entity, hz, tr, dt) {
    const ctx = getContext(world);
    const body = ctx.bodies.get(entity);
    if (!body) return;
    body.setAngularVelocity(hz.param0 || 7);
    if (hz.param1 > 0) {
      const home = anchorOf(entity, tr);
      hz.param3 += (dt * Math.max(0.1, hz.param2)) / hz.param1;
      steerTo(world, entity, home.x + Math.sin(hz.param3) * hz.param1, home.y);
    }
  },
  contact(world, player, _hz, ht) {
    const pt = player.get(Transform);
    if (pt) nearKill(world, player, pt, ht, 0.75);
  },
};
