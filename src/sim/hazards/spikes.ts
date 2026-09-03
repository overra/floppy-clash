import { getContext } from '../context';
import { createBoxBody, registerBody } from '../physics/bodies';
import { HazardKind, Static, Transform } from '../traits';
import { nearKill, spawnHazardEntity } from './common';
import type { HazardModule } from './types';

export const spikes: HazardModule = {
  typeId: 'spikes',
  kind: HazardKind.Spikes,
  create(world, obj) {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.Spikes);
    entity.add(Static());
    const w = obj.w ?? 2;
    const body = createBoxBody(ctx.physics, entity, 'sensor', obj.x, obj.y, w / 2, 0.25, 'static', { sensor: true });
    registerBody(world, entity, body);
    return entity;
  },
  contact(world, player, _hz, ht) {
    const pt = player.get(Transform);
    if (pt) nearKill(world, player, pt, ht, 0.7);
  },
};
