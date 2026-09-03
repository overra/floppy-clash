import { getContext } from '../context';
import { Destructible, HazardKind, Solid, Static } from '../traits';
import { createBoxBody, registerBody } from '../physics/bodies';
import { spawnHazardEntity } from './common';
import type { HazardModule } from './types';

export const destructible: HazardModule = {
  typeId: 'block.destructible',
  kind: HazardKind.Destructible,
  create(world, obj) {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.Destructible);
    const hp = obj.hp ?? 60;
    entity.add(Static(), Solid(), Destructible({ hp, maxHp: hp }));
    const body = createBoxBody(
      ctx.physics,
      entity,
      'solid',
      obj.x,
      obj.y,
      (obj.w ?? 2) / 2,
      (obj.h ?? 1) / 2,
      'static',
      { friction: 0.5 },
    );
    registerBody(world, entity, body);
    return entity;
  },
};
