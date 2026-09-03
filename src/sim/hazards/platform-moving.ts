import { HazardKind, HazardPath, Transform } from '../traits';
import { carryRider, createKinematicBox, stepHazardPath } from './common';
import type { HazardModule } from './types';

export const movingPlatform: HazardModule = {
  typeId: 'platform.moving',
  kind: HazardKind.MovingPlatform,
  create(world, obj) {
    const entity = createKinematicBox(world, obj, HazardKind.MovingPlatform);
    const points =
      obj.path && obj.path.length >= 2
        ? obj.path.map((p) => ({ x: p.x, y: p.y }))
        : [
            { x: obj.x - 4, y: obj.y },
            { x: obj.x + 4, y: obj.y },
          ];
    entity.add(
      HazardPath({
        points,
        index: 0,
        accum: 0,
        mode: obj.mode === 'loop' ? 0 : 1,
        dir: 1,
        speed: obj.speed ?? 3,
      }),
    );
    return entity;
  },
  step(world, entity, _hz, _tr, dt) {
    stepHazardPath(world, entity, dt);
  },
  contact(world, player, _hz, ht, ctrl, dt, hazard) {
    const pt = player.get(Transform);
    if (pt) carryRider(world, player, hazard, pt, ht, ctrl, dt);
  },
};
