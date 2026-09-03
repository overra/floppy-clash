import { HazardKind } from '../traits';
import { createDynamicBox } from './common';
import type { HazardModule } from './types';

export const barrel: HazardModule = {
  typeId: 'barrel.explosive',
  kind: HazardKind.Barrel,
  create: (world, obj) =>
    createDynamicBox(world, obj, HazardKind.Barrel, { density: 0.5, friction: 0.5, destructible: obj.hp ?? 20 }),
};
