import { HazardKind } from '../traits';
import { createDynamicBox } from './common';
import type { HazardModule } from './types';

export const crate: HazardModule = {
  typeId: 'crate',
  kind: HazardKind.Crate,
  create: (world, obj) => createDynamicBox(world, obj, HazardKind.Crate, { density: 0.5, friction: 0.5 }),
};
