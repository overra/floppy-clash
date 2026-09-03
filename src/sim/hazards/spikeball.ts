import { RevoluteJoint } from 'planck';
import { getContext } from '../context';
import { createCircleBody, registerBody } from '../physics/bodies';
import { HazardKind, Transform } from '../traits';
import { nearKill, spawnHazardEntity } from './common';
import type { HazardModule } from './types';

/** Appendix D: swinging on a chain, rolling, or dropping; instant kill. */
export const spikeball: HazardModule = {
  typeId: 'spikeball',
  kind: HazardKind.Spikeball,
  create(world, obj) {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.Spikeball);
    const r = obj.r ?? 0.4;
    const style = obj.style === 'roll' ? 1 : obj.style === 'drop' ? 2 : 0;
    const body = createCircleBody(ctx.physics, entity, 'prop', obj.x, obj.y, r, 'dynamic', {
      density: 0.8,
      friction: style === 1 ? 0.05 : 0.2,
      restitution: style === 1 ? 0.35 : 0.05,
      bullet: true,
    });
    registerBody(world, entity, body);
    if (style === 0) {
      const hang = 2.4;
      const anchor = ctx.physics.createBody({
        type: 'static',
        position: { x: obj.x, y: obj.y + hang },
      });
      ctx.physics.createJoint(
        new RevoluteJoint({ collideConnected: false }, anchor, body, { x: obj.x, y: obj.y + hang }),
      );
      body.setLinearVelocity({ x: 2.8, y: 0 });
    } else if (style === 1) {
      body.setLinearVelocity({ x: 3.4, y: 0 });
      body.setAngularVelocity(8);
    }
    return entity;
  },
  contact(world, player, _hz, ht) {
    const pt = player.get(Transform);
    if (pt) nearKill(world, player, pt, ht, 0.75);
  },
};
