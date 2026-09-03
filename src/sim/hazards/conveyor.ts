import { Vec2 } from 'planck';
import { authoredHalfWidth } from '../authored';
import { getContext } from '../context';
import { HazardKind, Transform } from '../traits';
import { createStaticBox } from './common';
import type { HazardModule } from './types';

export const conveyor: HazardModule = {
  typeId: 'conveyor',
  kind: HazardKind.Conveyor,
  create: (world, obj) => createStaticBox(world, obj, HazardKind.Conveyor, { friction: 0.6 }),
  contact(world, player, hz, ht, ctrl, dt) {
    const pt = player.get(Transform);
    if (!pt || !ctrl.grounded) return;
    const dx = Math.abs(pt.x - ht.x);
    const dy = Math.abs(pt.y - ht.y);
    // param0 is authored full width (default 2). Reach is half-width.
    // 0 means no belt — do not `|| 3` or `dx < param0` (that doubles the box).
    if (dx < authoredHalfWidth(hz.param0) && dy < 1.1 && !ctrl.ducking) {
      const body = getContext(world).bodies.get(player);
      if (body) {
        const v = body.getLinearVelocity();
        // param1 is authored belt speed (default 4 in paramsFromObject). 0 means frozen.
        body.setLinearVelocity(new Vec2(v.x + hz.param1 * dt * 8, v.y));
      }
    }
  },
};
