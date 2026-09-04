import { HazardKind } from '../traits';
import { createKinematicBox } from './common';
import type { HazardModule } from './types';

export const momentumPlatform: HazardModule = {
  typeId: 'platform.momentum',
  kind: HazardKind.Momentum,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.Momentum, { dynamic: true, density: 0.8 }),
};
