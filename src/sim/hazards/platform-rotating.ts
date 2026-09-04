import { getContext } from '../context';
import { HazardKind, Transform } from '../traits';
import { carryRider, createKinematicBox } from './common';
import type { HazardModule } from './types';

export const rotatingPlatform: HazardModule = {
  typeId: 'platform.rotating',
  kind: HazardKind.RotatingPlatform,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.RotatingPlatform),
  step(world, entity, hz) {
    const body = getContext(world).bodies.get(entity);
    if (body) body.setAngularVelocity(hz.param0 || 1);
  },
  contact(world, player, _hz, ht, ctrl, dt, hazard) {
    const pt = player.get(Transform);
    if (pt) carryRider(world, player, hazard, pt, ht, ctrl, dt);
  },
};
