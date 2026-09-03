import { Vec2 } from 'planck';
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
    if (dx < (hz.param0 || 3) && dy < 1.1 && !ctrl.ducking) {
      const body = getContext(world).bodies.get(player);
      if (body) {
        const v = body.getLinearVelocity();
        body.setLinearVelocity(new Vec2(v.x + (hz.param1 || 4) * dt * 8, v.y));
      }
    }
  },
};
