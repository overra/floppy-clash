import { Anchor, HazardKind, Transform } from '../traits';
import { anchorOf, carryRider, createKinematicBox, steerTo } from './common';
import type { HazardModule } from './types';

/**
 * Sweeps sinusoidally about its authored position: param0/param1 = half-extents (x/y),
 * param2 = peak linear speed (m/s), param3 = running phase.
 */
export const movingPlatform: HazardModule = {
  typeId: 'platform.moving',
  kind: HazardKind.MovingPlatform,
  create(world, obj) {
    const e = createKinematicBox(world, obj, HazardKind.MovingPlatform);
    e.add(Anchor({ x: obj.x, y: obj.y }));
    return e;
  },
  step(world, entity, hz, tr, dt) {
    const home = anchorOf(entity, tr);
    const amp = Math.max(0.01, Math.hypot(hz.param0, hz.param1));
    hz.param3 += (dt * Math.max(0.1, hz.param2)) / amp;
    const s = Math.sin(hz.param3);
    steerTo(world, entity, home.x + s * hz.param0, home.y + s * hz.param1);
  },
  contact(world, player, _hz, ht, ctrl, dt, hazard) {
    const pt = player.get(Transform);
    if (pt) carryRider(world, player, hazard, pt, ht, ctrl, dt);
  },
};
