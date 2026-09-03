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
    const on = hz.param0 || 40;
    const off = hz.param1 || 50;
    const warn = hz.param2 || 12;
    const cycle = on + off;
    const phase = ctx.tick % cycle;
    if (phase < warn) hz.armed = 2;
    else if (phase < on) hz.armed = 1;
    else hz.armed = 0;
  },
  contact(world, player, hz, ht) {
    if (hz.armed !== 1) return;
    const pt = player.get(Transform);
    if (!pt) return;
    const reach = hz.param3 || 14;
    if (Math.abs(pt.y - ht.y) < 0.35 && pt.x > ht.x && pt.x < ht.x + reach) {
      kill(world, player, pt.x, pt.y);
    }
  },
};
