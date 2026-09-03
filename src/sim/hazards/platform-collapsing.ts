import { Not } from 'koota';
import { authoredHalfWidth } from '../authored';
import { getContext } from '../context';
import { Dead, HazardKind, Player, Transform } from '../traits';
import { createKinematicBox } from './common';
import type { HazardModule } from './types';

export const collapsingPlatform: HazardModule = {
  typeId: 'platform.collapsing',
  kind: HazardKind.Collapsing,
  create: (world, obj) => createKinematicBox(world, obj, HazardKind.Collapsing, { dynamic: true }),
  step(world, entity, hz, tr) {
    if (hz.armed !== 1) return;
    let stood = false;
    world.query(Player, Transform, Not(Dead)).updateEach(([_p, pt]) => {
      // param0 is authored full width (default 3). Reach is half-width.
      // 0 means no stand — do not `|| 2` or `dx < param0` (that doubles the deck).
      if (Math.abs(pt.x - tr.x) < authoredHalfWidth(hz.param0) && pt.y > tr.y && pt.y < tr.y + 1.4)
        stood = true;
    });
    if (stood) hz.param1 += 1;
    const body = getContext(world).bodies.get(entity);
    // param2 is authored delay. 0 means collapse on the first stand tick.
    if (hz.param1 > hz.param2 && body) {
      body.setType('dynamic');
      hz.armed = 0;
    }
  },
};
