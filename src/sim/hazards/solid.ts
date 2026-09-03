import { HazardKind } from '../traits';
import { createStaticBox } from './common';
import type { HazardModule } from './types';

export const solid: HazardModule = {
  typeId: 'solid',
  kind: HazardKind.Solid,
  create: (world, obj) => createStaticBox(world, obj, HazardKind.Solid, { friction: 0.6 }),
};
