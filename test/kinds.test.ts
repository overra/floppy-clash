import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Health, Held, HeldBy, Loose, Projectile, Snake } from '../src/sim/traits';
import { WEAPON_DEFS } from '../src/sim/weapons/defs';
import { hold, makeSim, playerOf } from './helpers';

const KIND_IDS: Record<string, string> = {
  bullet: 'pistol',
  pellets: 'sawed-off',
  grenade: 'grenade-launcher',
  rocket: 'rpg',
  beam: 'lava-beam',
  melee: 'sword',
  field: 'time-bubble',
  creature: 'snake-gun',
  'burst-into': 'lava-spike-gun',
};

describe('projectile kinds', () => {
  it('each kind can be fired headless without throwing', () => {
    for (const [kind, id] of Object.entries(KIND_IDS)) {
      const def = WEAPON_DEFS.find((d) => d.id === id);
      expect(def?.projectile.kind, kind).toBe(kind);
      const sim = makeSim({ level: woodsClearing, seed: 21, settings: { playerCount: 2 } });
      const p = playerOf(sim);
      const gun = spawnWeapon(sim.ecs, id, 8, 6);
      gun.add(Held(), HeldBy(p));
      gun.remove(Loose);
      let shots = 0;
      expect(() => {
        for (let i = 0; i < 20; i++) {
          const ev = sim.step([
            hold({ attack: i < 6, aimX: 1, aimY: 0 }),
            hold({}),
            hold({}),
            hold({}),
          ]);
          shots += ev.filter((e) => e.type === 'shot' || e.type === 'explosion' || e.type === 'hit')
            .length;
        }
      }).not.toThrow();
      let leftover = 0;
      sim.ecs.query(Projectile).updateEach(() => {
        leftover += 1;
      });
      sim.ecs.query(Snake).updateEach(() => {
        leftover += 1;
      });
      const victim = playerOf(sim, 1);
      const hurt = (victim.get(Health)?.hp ?? 100) < 100;
      expect(shots + leftover > 0 || hurt, kind).toBe(true);
    }
  });
});
