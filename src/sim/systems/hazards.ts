import { createQuery, Not, type World } from 'koota';
import { getContext } from '../context';
import { moduleForKind } from '../hazards';
import { Controller, Dead, Destructible, Hazard, HazardKind, Player, Shape, Transform } from '../traits';
import { detonate } from '../weapons/projectiles';

const hazards = createQuery(Hazard, Transform);

/** A barrel is a grenade-launcher shell you can stand next to: same reach, a little less bite. */
const BARREL_BLAST_RADIUS = 2.4;
const BARREL_BLAST_DAMAGE = 55;
const BARREL_BLAST_IMPULSE = 12;

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
      const mod = moduleForKind(hz.kind);
      if (!mod?.contact) return;
      const dx = Math.abs(pt.x - ht.x);
      const dy = Math.abs(pt.y - ht.y);
      // Broad phase: the hazard's own extents plus a player-sized margin.
      const shape = hazard.get(Shape);
      const reachX = 1.6 + (shape ? Math.max(shape.hx, shape.r) : 0);
      const reachY = 1.6 + (shape ? Math.max(shape.hy, shape.r) : 0);
      const near = dx < reachX && dy < reachY;
      if (!near && hz.kind !== HazardKind.Laser) return;
      mod.contact(world, player, hz, ht, ctrl, dt, hazard);
    });
  });

  world.query(Destructible).updateEach(([d], entity) => {
    if (d.hp > 0) return;
    // A broken barrel goes off: the blast wounds neighbouring barrels too, so a cluster chains
    // (each is destroyed at end of tick, so nothing detonates twice).
    const t = entity.get(Transform);
    if (t && entity.get(Hazard)?.kind === HazardKind.Barrel) detonate(world, t.x, t.y, BARREL_BLAST_RADIUS, BARREL_BLAST_DAMAGE, BARREL_BLAST_IMPULSE);
    ctx.pendingDestroy.push(entity);
  });
}
