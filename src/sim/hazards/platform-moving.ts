import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, Transform } from '../traits';
import { carryRider, createKinematicBox } from './common';
import type { HazardModule } from './types';

export const movingPlatform: HazardModule = {
  typeId: 'platform.moving',
  kind: HazardKind.MovingPlatform,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.MovingPlatform),
  step(world, entity, hz, tr, dt) {
    const pathLen = Math.max(2, Math.round(hz.param0));
    const speed = hz.param1 || 3;
    const pingpong = hz.param2 >= 1;
    hz.param3 += dt * speed;
    void pathLen;
    void pingpong;
    const body = getContext(world).bodies.get(entity);
    if (body) {
      const targetX = tr.x + Math.sin(hz.param3) * (hz.param0 || 4);
      const targetY = tr.y + Math.cos(hz.param3 * 0.35) * (hz.param1 > 4 ? 0 : 0);
      const p = body.getPosition();
      body.setLinearVelocity(new Vec2((targetX - p.x) / dt, (targetY - p.y) / dt));
    }
  },
  contact(world, player, _hz, ht, ctrl, dt, hazard) {
    const pt = player.get(Transform);
    if (pt) carryRider(world, player, hazard, pt, ht, ctrl, dt);
  },
};
