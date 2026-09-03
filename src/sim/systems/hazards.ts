import { createQuery, Not, type Entity, type World } from 'koota';
import { emit, getContext } from '../context';
import { moduleForKind } from '../hazards';
import { applyExplosion } from '../physics/queries';
import { takeDamage } from '../player/health';
import type { FixtureUserData } from '../physics/categories';
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

  world.query(Destructible, Transform).updateEach(([d, t], entity) => {
    if (d.hp > 0) return;
    const hz = entity.get(Hazard);
    if (hz?.kind === HazardKind.Barrel) {
      emit(world, { type: 'explosion', x: t.x, y: t.y, radius: 2.4, damage: 35 });
      applyExplosion(world, t.x, t.y, 2.4, 10, (body, falloff) => {
        const data = body.getUserData() as FixtureUserData | undefined;
        const target = data?.entity as Entity | undefined;
        if (!target || !world.has(target) || !target.has(Player) || target.has(Dead)) return;
        takeDamage(world, target, 10 + 45 * falloff, 'body', -1, t.x, t.y);
      });
    }
    ctx.pendingDestroy.push(entity);
  });
}
