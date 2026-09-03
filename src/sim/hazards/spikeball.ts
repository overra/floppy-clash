import { RevoluteJoint } from 'planck';
import { getContext } from '../context';
import { createCircleBody, registerBody } from '../physics/bodies';
import { HazardKind, PrevTransform, Transform } from '../traits';
import { diskSweepsPlayer, kill, spawnHazardEntity } from './common';
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
  contact(world, player, hz, ht, _ctrl, _dt, hazard) {
    const pt = player.get(Transform);
    if (!pt) return;
    const ctx = getContext(world);
    const prev = hazard.get(PrevTransform);
    const pprev = player.get(PrevTransform);
    const body = ctx.bodies.get(hazard);
    const pos = body?.getPosition();
    const lastX = prev?.x ?? ht.x;
    const lastY = prev?.y ?? ht.y;
    const bodyX = pos?.x ?? ht.x;
    const bodyY = pos?.y ?? ht.y;
    const reach = (hz.param0 || 0.4) + 0.35;
    const samples = [
      [pt.x, pt.y],
      [pprev?.x ?? pt.x, pprev?.y ?? pt.y],
    ] as const;
    for (const [px, py] of samples) {
      if (
        diskSweepsPlayer(px, py, ht.x, ht.y, reach, lastX, lastY) ||
        diskSweepsPlayer(px, py, bodyX, bodyY, reach, ht.x, ht.y)
      ) {
        kill(world, player, pt.x, pt.y);
        return;
      }
    }
  },
};
