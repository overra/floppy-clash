import { getContext } from '../context';
import { HazardKind, Static, Transform } from '../traits';
import { spawnHazardEntity, kill } from './common';
import type { HazardModule } from './types';

export const laser: HazardModule = {
  typeId: 'laser',
  kind: HazardKind.Laser,
  create(world, obj) {
    const entity = spawnHazardEntity(world, obj, HazardKind.Laser);
    entity.add(Static());
    return entity;
  },
  step(world, _entity, hz) {
    const ctx = getContext(world);
    const cycle = (hz.param0 || 90) + (hz.param1 || 90);
    const phase = (ctx.tick + (hz.param2 || 0)) % cycle;
    hz.armed = phase > (hz.param0 || 90) ? 1 : 0;
  },
  contact(world, player, hz, ht) {
    if (!hz.armed) return;
    const pt = player.get(Transform);
    if (!pt) return;
    const reach = hz.param3 || 14;
    if (Math.abs(pt.y - ht.y) < 0.35 && pt.x > ht.x && pt.x < ht.x + reach) {
      kill(world, player, pt.x, pt.y);
    }
  },
};
