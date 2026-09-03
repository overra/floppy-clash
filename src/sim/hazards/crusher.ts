import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, Transform } from '../traits';
import { createKinematicBox, kill } from './common';
import type { HazardModule } from './types';

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
  contact(world, player, _hz, ht) {
    const pt = player.get(Transform);
    if (!pt) return;
    const dx = Math.abs(pt.x - ht.x);
    const dy = Math.abs(pt.y - ht.y);
    if (dx < 0.5 && dy < 0.8) kill(world, player, pt.x, pt.y);
  },
};
