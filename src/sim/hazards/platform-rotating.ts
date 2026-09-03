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
    // param0 is authored omega (default 1 in paramsFromObject). 0 means frozen —
    // do not `|| 1` or a freeze becomes a 1 rad/s this-tick drive.
    if (body) body.setAngularVelocity(hz.param0);
  },
  contact(world, player, _hz, ht, ctrl, dt, hazard) {
    const pt = player.get(Transform);
    if (pt) carryRider(world, player, hazard, pt, ht, ctrl, dt);
  },
};
