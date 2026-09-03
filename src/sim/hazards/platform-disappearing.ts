import { getContext } from '../context';
import { HazardKind } from '../traits';
import { createKinematicBox } from './common';
import type { HazardModule } from './types';

export const disappearingPlatform: HazardModule = {
  typeId: 'platform.disappearing',
  kind: HazardKind.Disappearing,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.Disappearing),
  step(world, entity, hz) {
    const ctx = getContext(world);
    // param0 is authored period. 0 means frozen solid — do not `|| 180`.
    const period = hz.param0;
    if (period <= 0) {
      hz.armed = 1;
      const frozen = ctx.bodies.get(entity);
      if (frozen) frozen.setActive(true);
      return;
    }
    const phase = (ctx.tick + hz.param1) % period;
    const solidFor = period * 0.55;
    const warn = 18;
    const solid = phase < solidFor;
    const warning = solid && phase >= solidFor - warn;
    hz.armed = !solid ? 0 : warning ? 2 : 1;
    const body = ctx.bodies.get(entity);
    if (body) body.setActive(solid);
  },
};
