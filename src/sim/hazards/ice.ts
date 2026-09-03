import { HazardKind } from '../traits';
import { createStaticBox } from './common';
import type { HazardModule } from './types';

export const ice: HazardModule = {
  typeId: 'ice',
  kind: HazardKind.Ice,
  create: (world, obj) => createStaticBox(world, obj, HazardKind.Ice, { friction: 0.02 }),
};
