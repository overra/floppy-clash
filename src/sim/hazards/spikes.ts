import { getContext } from '../context';
import { createBoxBody, registerBody } from '../physics/bodies';
import { HazardKind, Static, Transform } from '../traits';
import { kill, spawnHazardEntity } from './common';
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
  contact(world, player, hz, ht) {
    const pt = player.get(Transform);
    if (!pt) return;
    // The strip is w wide (param0); anyone whose feet land on it dies along its whole length.
    const halfW = (hz.param0 || 2) / 2;
    if (Math.abs(pt.x - ht.x) < halfW + 0.2 && Math.abs(pt.y - ht.y) < 0.75) kill(world, player, pt.x, pt.y);
  },
};
