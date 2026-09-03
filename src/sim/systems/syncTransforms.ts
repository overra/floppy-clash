import { createQuery, type World } from 'koota';
import { getContext } from '../context';
import { PhysBody, PrevTransform, Transform } from '../traits';

const bodies = createQuery(PhysBody, Transform, PrevTransform);

export function syncTransforms(world: World): void {
  world.query(bodies).updateEach(([phys, t, prev]) => {
    prev.x = t.x;
    prev.y = t.y;
    prev.angle = t.angle;
    const body = phys.body;
    if (!body) return;
    const p = body.getPosition();
    t.x = p.x;
    t.y = p.y;
    t.angle = body.getAngle();
  });
}

export function physicsStep(world: World): void {
  const ctx = getContext(world);
  ctx.onIce.clear();
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  ctx.physics.step(1 / ctx.tuning.tickRate, ctx.tuning.velocityIterations, ctx.tuning.positionIterations);
  ctx.physics.clearForces();
  ctx.lastPhysicsMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
}
