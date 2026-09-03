import { getContext } from '../context';
import { spawnWeapon } from '../weapons/systems';
import { HazardKind } from '../traits';
import { weaponByIndex } from '../weapons/defs';
import { spawnHazardEntity } from './common';
import type { HazardModule } from './types';

export const triggerDrop: HazardModule = {
  typeId: 'trigger.drop',
  kind: HazardKind.TriggerDrop,
  create: (world, obj) => spawnHazardEntity(world, obj, HazardKind.TriggerDrop),
  step(world, entity, hz, tr) {
    const ctx = getContext(world);
    if (hz.armed && ctx.tick >= hz.param0) {
      const def = weaponByIndex(hz.param1 || 1);
      spawnWeapon(world, def.id, tr.x, tr.y);
      hz.armed = 0;
    }
    void entity;
  },
};
