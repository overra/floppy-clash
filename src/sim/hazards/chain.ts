import { RevoluteJoint } from 'planck';
import { getContext } from '../context';
import { assignNetId, createBoxBody, registerBody } from '../physics/bodies';
import { Destructible, Hazard, HazardKind, Static, Transform } from '../traits';
import { spawnHazardEntity } from './common';
import type { HazardModule } from './types';

export const chain: HazardModule = {
  typeId: 'chain',
  kind: HazardKind.Chain,
  create(world, obj) {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.Chain);
    const links = obj.links ?? 5;
    entity.add(Static(), Destructible({ hp: 40, maxHp: 40 }));
    const anchor = createBoxBody(ctx.physics, entity, 'solid', obj.x, obj.y, 0.1, 0.1, 'static');
    registerBody(world, entity, anchor);
    let prevBody = anchor;
    for (let i = 0; i < links; i++) {
      const link = world.spawn(
        Transform({ x: obj.x, y: obj.y - (i + 1) * 0.35, angle: 0 }),
        Hazard({ kind: HazardKind.Chain, param0: i, param1: 0, param2: 0, param3: 0, hp: 20, armed: 1 }),
        Destructible({ hp: 20, maxHp: 20 }),
      );
      assignNetId(world, link);
      const body = createBoxBody(ctx.physics, link, 'prop', obj.x, obj.y - (i + 1) * 0.35, 0.08, 0.16, 'dynamic', {
        density: 0.4,
        friction: 0.3,
        fixedRotation: false,
      });
      registerBody(world, link, body);
      ctx.physics.createJoint(
        new RevoluteJoint(
          { collideConnected: false, enableLimit: true, lowerAngle: -0.8, upperAngle: 0.8 },
          prevBody,
          body,
          { x: obj.x, y: obj.y - i * 0.35 },
        ),
      );
      prevBody = body;
    }
    return entity;
  },
};
