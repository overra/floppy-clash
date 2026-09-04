import { createQuery, Not, type World } from 'koota';
import { emit, getContext } from '../context';
import { spawnRagdoll } from '../player/ragdoll';
import { destroyBody } from '../physics/bodies';
import { isLaunch } from '../rules/mode';
import { tickModifiers } from '../weapons/consumables';
import { Combat, Controller, Dead, Health, Player, Status, Stocks, Transform } from '../traits';

const living = createQuery(Player, Health, Transform, Not(Dead));

export function damageDeath(world: World): void {
  const ctx = getContext(world);
  const bounds = ctx.level.bounds;
  const margin = ctx.level.killMargin ?? 6;
  const launch = isLaunch(world);

  world.query(living).updateEach(([player, health, transform], entity) => {
    // Deaths dealt by takeDamage() already emitted their kill; burn ticks and the void below do not.
    const aliveBefore = health.hp > 0;
    const status = entity.get(Status);
    if (status) {
      if (status.burning > 0) {
        status.burning -= 1;
        if (ctx.tick % 12 === 0) {
          if (launch) health.percent += 5;
          else health.hp -= 5;
        }
      }
      if (status.slowed > 0) status.slowed -= 1;
      if (status.glued > 0) status.glued -= 1;
      if (status.bubbled > 0) status.bubbled -= 1;
      if (status.pulled > 0) status.pulled -= 1;
      if (status.invuln > 0) status.invuln -= 1;
      if (status.encumbered > 0) status.encumbered -= 1;
      entity.set(Status, status);
    }
    tickModifiers(entity);

    const oob =
      transform.x < bounds.x - margin ||
      transform.x > bounds.x + bounds.w + margin ||
      transform.y < bounds.y - margin ||
      transform.y > bounds.y + bounds.h + margin;
    if (oob) health.hp = 0;

    if (health.hp <= 0 && aliveBefore) {
      emit(world, { type: 'kill', source: -1, target: entity, x: transform.x, y: transform.y });
    }

    if (health.hp <= 0) {
      entity.add(Dead());
      const ctrl = entity.get(Controller);
      spawnRagdoll(world, entity, ctrl?.vx ?? 0, ctrl?.vy ?? 0);
      destroyBody(world, entity);
      entity.remove(Combat);
      emit(world, { type: 'blood', x: transform.x, y: transform.y, amount: 40 });
      if (launch) {
        // A life is spent; with any left the fighter drops back in once the respawn timer runs out.
        const stocks = entity.get(Stocks);
        if (stocks) {
          const left = Math.max(0, stocks.left - 1);
          entity.set(Stocks, { left, respawnIn: left > 0 ? ctx.tuning.respawnDelayTicks : 0 });
          emit(world, { type: 'stock', slot: player.slot, left });
        }
      }
    }
  });
}
