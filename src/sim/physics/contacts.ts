import type { Contact, World as PhysicsWorld } from 'planck';
import type { SimContext } from '../context';
import type { FixtureUserData } from './categories';
import { Controller, Hazard, HazardKind } from '../traits';

/** Planck begin-contact + pre-solve (PLAN 4.3 / 4.6 / Appendix D conveyor). */
export function bindContactRouter(physics: PhysicsWorld, ctx: SimContext): void {
  physics.on('begin-contact', (contact: Contact) => {
    const a = contact.getFixtureA().getBody().getUserData() as FixtureUserData | undefined;
    const b = contact.getFixtureB().getBody().getUserData() as FixtureUserData | undefined;
    if (a?.kind === 'projectile') ctx.contactHits.add(a.entity);
    if (b?.kind === 'projectile') ctx.contactHits.add(b.entity);
  });

  physics.on('pre-solve', (contact: Contact) => {
    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();
    const entA = ctx.entityOf.get(bodyA);
    const entB = ctx.entityOf.get(bodyB);
    markIce(ctx, entA, entB);
    const speedA = conveyorSpeed(entA);
    const speedB = conveyorSpeed(entB);
    const player = playerCtrl(entA) ?? playerCtrl(entB);
    if (player?.ducking) {
      contact.setTangentSpeed(0);
      return;
    }
    if (speedA != null) contact.setTangentSpeed(speedA);
    else if (speedB != null) contact.setTangentSpeed(-speedB);
  });
}

function conveyorSpeed(entity: ReturnType<SimContext['entityOf']['get']>): number | undefined {
  if (!entity) return undefined;
  const hz = entity.get(Hazard);
  if (hz?.kind !== HazardKind.Conveyor) return undefined;
  return hz.param1 || 4;
}

function playerCtrl(entity: ReturnType<SimContext['entityOf']['get']>) {
  return entity?.get(Controller);
}

function isIce(entity: ReturnType<SimContext['entityOf']['get']>): boolean {
  return entity?.get(Hazard)?.kind === HazardKind.Ice;
}

function markIce(
  ctx: SimContext,
  entA: ReturnType<SimContext['entityOf']['get']>,
  entB: ReturnType<SimContext['entityOf']['get']>,
): void {
  if (!isIce(entA) && !isIce(entB)) return;
  const player = entA?.get(Controller) ? entA : entB?.get(Controller) ? entB : undefined;
  if (player) ctx.onIce.add(player as unknown as number);
}
