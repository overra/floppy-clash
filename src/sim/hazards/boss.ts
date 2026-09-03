import { Boss, HazardKind } from '../traits';
import { createDynamicBox } from './common';
import type { HazardModule } from './types';

export const boss: HazardModule = {
  typeId: 'boss',
  kind: HazardKind.Boss,
  create(world, obj) {
    const entity = createDynamicBox(world, obj, HazardKind.Boss, {
      density: 1.2,
      friction: 0.4,
      destructible: obj.hp ?? 200,
    });
    entity.add(Boss({ hp: obj.hp ?? 200, bite: 0, speed: 3.2 }));
    return entity;
  },
};
