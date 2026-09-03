import { Vec2 } from 'planck';
import { getContext } from '../context';
import { takeDamage } from '../player/health';
import { HazardKind, Transform } from '../traits';
import { createKinematicBox, lavaTouch } from './common';
import type { HazardModule } from './types';

export const lava: HazardModule = {
  typeId: 'lava',
  kind: HazardKind.Lava,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.Lava, { sensor: true, friction: 0.4, tag: false }),
  step(world, entity, hz, tr, dt) {
    if (hz.param0 !== 0) tr.y += hz.param0 * dt;
    const body = getContext(world).bodies.get(entity);
    if (body) body.setPosition(new Vec2(tr.x, tr.y));
  },
  contact(world, player, hz, ht) {
    const pt = player.get(Transform);
    if (!pt) return;
    const dx = Math.abs(pt.x - ht.x);
    if (dx < (hz.param1 || 4) && pt.y < ht.y + 0.6 && pt.y > ht.y - 1) {
      const ctx = getContext(world);
      const last = lavaTouch.get(player) ?? -999;
      if (ctx.tick - last >= ctx.tuning.lavaCooldownTicks) {
        takeDamage(world, player, ctx.tuning.lavaDamage, 'body', -1, pt.x, pt.y);
        lavaTouch.set(player, ctx.tick);
        const body = ctx.bodies.get(player);
        if (body) {
          const v = body.getLinearVelocity();
          body.setLinearVelocity(new Vec2(v.x, v.y + 8));
        }
      }
    }
  },
};
