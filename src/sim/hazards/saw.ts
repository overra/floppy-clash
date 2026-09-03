import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, Transform } from '../traits';
import { createKinematicCircle, nearKill } from './common';
import type { HazardModule } from './types';

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
  contact(world, player, _hz, ht) {
    const pt = player.get(Transform);
    if (pt) nearKill(world, player, pt, ht, 0.7);
  },
};
