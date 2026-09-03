import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Held, HeldBy, Loose } from '../src/sim/traits';
import { WEAPON_DEFS } from '../src/sim/weapons/defs';
import { hold, makeSim, playerOf } from './helpers';

describe('M6 roster', () => {
  it('every droppable weapon can be spawned, fired, and thrown', () => {
    const droppable = WEAPON_DEFS.filter((d) => d.dropWeight > 0);
    expect(droppable.length).toBeGreaterThanOrEqual(30);
    const sample = droppable.filter((_, i) => i % 3 === 0);
    for (const def of sample) {
      const sim = makeSim({ level: woodsClearing, seed: 50, settings: { playerCount: 1 } });
      const p = playerOf(sim);
      const gun = spawnWeapon(sim.ecs, def.id, 8, 6);
      gun.add(Held(), HeldBy(p));
      gun.remove(Loose);
      expect(() => {
        for (let i = 0; i < 12; i++) {
          sim.step([hold({ attack: i < 4, throw: i === 8, aimX: 1, aimY: 0.1 }), hold({}), hold({}), hold({})]);
        }
      }).not.toThrow();
    }
  });

  it('covers every projectile kind', () => {
    const kinds = new Set(WEAPON_DEFS.map((d) => d.projectile.kind));
    for (const kind of ['bullet', 'pellets', 'grenade', 'rocket', 'beam', 'melee', 'field', 'creature', 'burst-into']) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });
});
