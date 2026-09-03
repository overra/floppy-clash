import { createQuery, Not, type World } from 'koota';
import { getContext } from '../context';
import { moduleForKind } from '../hazards';
import { Controller, Dead, Destructible, Hazard, HazardKind, Player, Transform } from '../traits';

const hazards = createQuery(Hazard, Transform);

export function hazardsStep(world: World): void {
  const ctx = getContext(world);
  const dt = 1 / ctx.tuning.tickRate;

  world.query(hazards).updateEach(([hz, tr], entity) => {
    moduleForKind(hz.kind)?.step?.(world, entity, hz, tr, dt);
  });

  world.query(Player, Transform, Controller, Not(Dead)).updateEach(([_p, _pt, ctrl], player) => {
    world.query(hazards).updateEach(([hz, ht], hazard) => {
      const pt = player.get(Transform);
      if (!pt) return;
      const dx = Math.abs(pt.x - ht.x);
      const dy = Math.abs(pt.y - ht.y);
      const near = dx < 1.6 && dy < 1.6;
      const mod = moduleForKind(hz.kind);
      if (!mod?.contact) return;
      if (!near && hz.kind !== HazardKind.Laser && hz.kind !== HazardKind.Conveyor) return;
      mod.contact(world, player, hz, ht, ctrl, dt, hazard);
    });
  });

  world.query(Destructible).updateEach(([d], entity) => {
    if (d.hp <= 0) ctx.pendingDestroy.push(entity);
  });
}
