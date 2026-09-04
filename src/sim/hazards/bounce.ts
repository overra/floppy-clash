import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, Transform } from '../traits';
import { createStaticBox } from './common';
import type { HazardModule } from './types';

export const bounce: HazardModule = {
  typeId: 'bounce',
  kind: HazardKind.Bounce,
  create: (world, obj) => createStaticBox(world, obj, HazardKind.Bounce, { friction: 0.1, restitution: 1.2 }),
  contact(world, player, hz, ht, ctrl) {
    const pt = player.get(Transform);
    if (!pt || !ctrl.grounded) return;
    const dx = Math.abs(pt.x - ht.x);
    const dy = Math.abs(pt.y - ht.y);
    // param0 = half-width, param1 = launch speed
    if (dx < (hz.param0 || 1.2) + 0.2 && dy < 1.3) {
      const body = getContext(world).bodies.get(player);
      if (body) {
        const v = body.getLinearVelocity();
        body.setLinearVelocity(new Vec2(v.x, hz.param1 || 18));
      }
    }
  },
};
