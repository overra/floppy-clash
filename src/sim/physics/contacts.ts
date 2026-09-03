import type { Contact, World as PhysicsWorld } from 'planck';
import type { SimContext } from '../context';
import type { FixtureUserData } from './categories';

/** Planck begin-contact router (PLAN 4.3 / 4.6). Sensors and projectiles report here. */
export function bindContactRouter(physics: PhysicsWorld, ctx: SimContext): void {
  physics.on('begin-contact', (contact: Contact) => {
    const a = contact.getFixtureA().getBody().getUserData() as FixtureUserData | undefined;
    const b = contact.getFixtureB().getBody().getUserData() as FixtureUserData | undefined;
    if (a?.kind === 'projectile') ctx.contactHits.add(a.entity);
    if (b?.kind === 'projectile') ctx.contactHits.add(b.entity);
  });
}
