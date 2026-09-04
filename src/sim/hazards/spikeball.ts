import { getContext } from '../context';
import { HazardKind, Transform } from '../traits';
import { createKinematicCircle, nearKill } from './common';
import type { HazardModule } from './types';

export const spikeball: HazardModule = {
  typeId: 'spikeball',
  kind: HazardKind.Spikeball,
  create: (world, obj) => createKinematicCircle(world, obj, HazardKind.Spikeball),
  step(world, entity) {
    const body = getContext(world).bodies.get(entity);
    if (body) body.setAngularVelocity(3);
  },
  contact(world, player, _hz, ht) {
    const pt = player.get(Transform);
    if (pt) nearKill(world, player, pt, ht, 0.7);
  },
};
