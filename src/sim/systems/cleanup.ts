import { createRemoved, type World } from 'koota';
import { getContext } from '../context';
import { destroyBody } from '../physics/bodies';
import { emit } from '../context';
import { Lifetime, NetId, PhysBody } from '../traits';

const Removed = createRemoved();

export function cleanup(world: World): void {
  const ctx = getContext(world);
  world.query(Lifetime).updateEach(([life], entity) => {
    life.ticksLeft -= 1;
    if (life.ticksLeft <= 0) ctx.pendingDestroy.push(entity);
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
