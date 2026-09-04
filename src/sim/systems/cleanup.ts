import { createQuery, createRemoved, Not, type World } from 'koota';
import { getContext } from '../context';
import { destroyBody } from '../physics/bodies';
import { emit } from '../context';
import { Lifetime, NetId, PhysBody, Player, Transform } from '../traits';

const Removed = createRemoved();
const loose = createQuery(PhysBody, Transform, Not(Player));
/** How far past the arena a body may drift before it is gone for good (players die sooner). */
const VOID_MARGIN = 8;

export function cleanup(world: World): void {
  const ctx = getContext(world);
  world.query(Lifetime).updateEach(([life], entity) => {
    life.ticksLeft -= 1;
    if (life.ticksLeft <= 0) ctx.pendingDestroy.push(entity);
  });

  // Guns, corpses and crates that fell into the void would otherwise fall forever, still costing
  // physics time and still counting toward the loose-weapon cap that gates new drops.
  const { bounds } = ctx.level;
  world.query(loose).updateEach(([, t], entity) => {
    if (
      t.x < bounds.x - VOID_MARGIN ||
      t.x > bounds.x + bounds.w + VOID_MARGIN ||
      t.y < bounds.y - VOID_MARGIN ||
      t.y > bounds.y + bounds.h + VOID_MARGIN * 2
    ) {
      ctx.pendingDestroy.push(entity);
    }
  });

  for (const entity of ctx.pendingDestroy) {
    if (!world.has(entity)) continue;
    destroyBody(world, entity);
    const net = entity.get(NetId);
    if (net) emit(world, { type: 'despawn', netId: net.id });
    entity.destroy();
  }
  ctx.pendingDestroy.length = 0;

  world.query(Removed(PhysBody)).forEach((entity) => {
    destroyBody(world, entity);
  });
}
