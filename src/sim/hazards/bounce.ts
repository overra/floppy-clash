import { Vec2 } from 'planck';
import { authoredHalfWidth } from '../authored';
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
    // param0 is authored full width (default 2). Reach is half-width.
    // 0 means no pad — do not `|| 1.2` or `dx < param0` (that doubles the box).
    if (dx < authoredHalfWidth(hz.param0) && dy < 1) {
      const body = getContext(world).bodies.get(player);
      if (body && hz.param1 !== 0) {
        const v = body.getLinearVelocity();
        // param1 is authored launch speed (default 16). 0 means the pad is frozen.
        body.setLinearVelocity(new Vec2(v.x, hz.param1));
      }
    }
  },
};
