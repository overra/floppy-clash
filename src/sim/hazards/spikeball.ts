import { RevoluteJoint } from 'planck';
import { getContext } from '../context';
import { createCircleBody, registerBody } from '../physics/bodies';
import { HazardKind, Transform } from '../traits';
import { nearKill, spawnHazardEntity } from './common';
import type { HazardModule } from './types';

/** Appendix D: dynamic circle + revolute hang; sensor-style kill on contact. */
export const spikeball: HazardModule = {
  typeId: 'spikeball',
  kind: HazardKind.Spikeball,
  create(world, obj) {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.Spikeball);
    const r = obj.r ?? 0.4;
    const hang = 2.4;
    const body = createCircleBody(ctx.physics, entity, 'prop', obj.x, obj.y, r, 'dynamic', {
      density: 0.8,
      friction: 0.2,
      restitution: 0.05,
      bullet: true,
    });
    registerBody(world, entity, body);
    const anchor = ctx.physics.createBody({
      type: 'static',
      position: { x: obj.x, y: obj.y + hang },
    });
    ctx.physics.createJoint(
      new RevoluteJoint({ collideConnected: false }, anchor, body, { x: obj.x, y: obj.y + hang }),
    );
    body.setLinearVelocity({ x: 2.8, y: 0 });
    return entity;
  },
  contact(world, player, _hz, ht) {
    const pt = player.get(Transform);
    if (pt) nearKill(world, player, pt, ht, 0.75);
  },
};
