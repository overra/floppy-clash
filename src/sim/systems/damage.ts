import { createQuery, Not, type World } from 'koota';
import { emit, getContext } from '../context';
import { spawnRagdoll } from '../player/ragdoll';
import { destroyBody } from '../physics/bodies';
import { Combat, Controller, Dead, Health, Player, Status, Transform } from '../traits';

const living = createQuery(Player, Health, Transform, Not(Dead));

export function damageDeath(world: World): void {
  const ctx = getContext(world);
  const bounds = ctx.level.bounds;
  const margin = ctx.level.killMargin ?? 6;

  world.query(living).updateEach(([player, health, transform], entity) => {
    const status = entity.get(Status);
    if (status) {
      if (status.burning > 0) {
        // PLAN Appendix C: 5/s for 6 s. Tick on elapsed time so refreshing
        // `burning` to duration (lava stream / flamethrower) does not instant-proc.
        const elapsed = ctx.tuning.burnDurationTicks - status.burning;
        if (elapsed > 0 && elapsed % ctx.tuning.burnIntervalTicks === 0) {
          health.hp -= ctx.tuning.burnDamage;
        }
        status.burning -= 1;
      }
      if (status.slowed > 0) status.slowed -= 1;
      if (status.glued > 0) status.glued -= 1;
      if (status.bubbled > 0) status.bubbled -= 1;
      entity.set(Status, status);
    }

    const oob =
      transform.x < bounds.x - margin ||
      transform.x > bounds.x + bounds.w + margin ||
      transform.y < bounds.y - margin ||
      transform.y > bounds.y + bounds.h + margin;
    if (oob) health.hp = 0;

    if (health.hp <= 0) {
      entity.add(Dead());
      const ctrl = entity.get(Controller);
      spawnRagdoll(world, entity, ctrl?.vx ?? 0, ctrl?.vy ?? 0);
      destroyBody(world, entity);
      entity.remove(Combat);
      emit(world, { type: 'blood', x: transform.x, y: transform.y, amount: 40 });
      void player;
    }
  });
}
