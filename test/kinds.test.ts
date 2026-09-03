import { describe, expect, it } from 'vitest';
import type { LevelDef } from '../src/sim/level/schema';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Health, Held, HeldBy, Loose, Projectile, ProjectileKind, Snake } from '../src/sim/traits';
import { WEAPON_DEFS } from '../src/sim/weapons/defs';
import { hold, makeSim, pin, playerOf } from './helpers';

/** Open arena so pellets / rockets are not eaten by woods platforms on the fire tick. */
const OPEN: LevelDef = {
  id: 'kinds-open',
  name: 'Kinds Open',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 40, h: 24 },
  killMargin: 8,
  spawns: [
    { x: 8, y: 4 },
    { x: 20, y: 4 },
    { x: 12, y: 8 },
    { x: 16, y: 8 },
  ],
  drops: { enabled: false, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [{ type: 'solid', x: 20, y: 1, w: 40, h: 2 }],
};

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

const KIND_ENUM: Record<string, number> = {
  bullet: ProjectileKind.Bullet,
  pellets: ProjectileKind.Pellet,
  grenade: ProjectileKind.Grenade,
  rocket: ProjectileKind.Rocket,
  beam: ProjectileKind.Beam,
  melee: ProjectileKind.Melee,
  field: ProjectileKind.Field,
  creature: ProjectileKind.Creature,
  'burst-into': ProjectileKind.BurstInto,
};

function countProjectiles(sim: ReturnType<typeof makeSim>, kind?: number): number {
  let n = 0;
  sim.ecs.query(Projectile).updateEach(([p]) => {
    if (kind === undefined || p.kind === kind) n += 1;
  });
  return n;
}

function countSnakes(sim: ReturnType<typeof makeSim>): number {
  let n = 0;
  sim.ecs.query(Snake).updateEach(() => {
    n += 1;
  });
  return n;
}

describe('projectile kinds', () => {
  it('each kind fires its named PLAN behavior (not leftover-or-hurt)', () => {
    for (const [kind, id] of Object.entries(KIND_IDS)) {
      const def = WEAPON_DEFS.find((d) => d.id === id);
      expect(def?.projectile.kind, kind).toBe(kind);
      const sim = makeSim({ level: OPEN, seed: 21, settings: { playerCount: 2 } });
      const p = playerOf(sim, 0);
      const victim = playerOf(sim, 1);
      pin(sim, p, 10, 4);
      pin(sim, victim, kind === 'melee' ? 10.55 : 14, 4);
      const gun = spawnWeapon(sim.ecs, id, 10, 5);
      gun.add(Held(), HeldBy(p));
      gun.remove(Loose);
      const hp0 = victim.get(Health)?.hp ?? 100;
      let shots = 0;
      let maxOfKind = 0;
      let maxFuse = 0;
      const aim = kind === 'melee' ? hold({ attack: true, aimX: 1, aimY: 0 }) : hold({ attack: true, aimX: 0, aimY: 1 });
      expect(() => {
        for (let i = 0; i < 8; i++) {
          pin(sim, p, 10, 4);
          if (kind === 'melee') pin(sim, victim, 10.55, 4);
          const ev = sim.step([aim, hold({}), hold({}), hold({})]);
          shots += ev.filter((e) => e.type === 'shot').length;
          maxOfKind = Math.max(maxOfKind, countProjectiles(sim, KIND_ENUM[kind]));
          sim.ecs.query(Projectile).updateEach(([proj]) => {
            if (proj.kind === KIND_ENUM[kind]) maxFuse = Math.max(maxFuse, proj.fuse);
          });
        }
      }).not.toThrow();

      if (kind === 'bullet') {
        expect(shots, 'bullet shot event').toBeGreaterThan(0);
        expect(maxOfKind, 'bullet projectile').toBeGreaterThan(0);
      } else if (kind === 'pellets') {
        expect(shots, 'pellets shot event').toBeGreaterThan(0);
        expect(maxOfKind, 'five pellets').toBeGreaterThanOrEqual(5);
      } else if (kind === 'grenade') {
        expect(shots, 'grenade shot event').toBeGreaterThan(0);
        expect(maxOfKind, 'grenade body').toBeGreaterThan(0);
        expect(maxFuse, 'grenade fuse').toBeGreaterThan(0);
      } else if (kind === 'rocket') {
        expect(shots, 'rocket shot event').toBeGreaterThan(0);
        expect(maxOfKind, 'rocket body').toBeGreaterThan(0);
      } else if (kind === 'beam') {
        expect(shots, 'beam shot event').toBeGreaterThan(0);
        expect(maxOfKind, 'beam projectile').toBeGreaterThan(0);
        expect(maxFuse, 'beam warning fuse').toBeGreaterThan(10);
        expect(victim.get(Health)?.hp ?? 100, 'beam still warning').toBe(hp0);
      } else if (kind === 'melee') {
        expect(shots, 'melee shot event').toBeGreaterThan(0);
        expect((victim.get(Health)?.hp ?? 100) < hp0, 'melee arc hit').toBe(true);
      } else if (kind === 'field') {
        expect(shots, 'field shot event').toBeGreaterThan(0);
        expect(maxOfKind, 'field projectile').toBeGreaterThan(0);
      } else if (kind === 'creature') {
        expect(shots, 'creature shot event').toBeGreaterThan(0);
        expect(countSnakes(sim), 'snake spawned').toBeGreaterThan(0);
      } else if (kind === 'burst-into') {
        expect(shots, 'burst-into shot event').toBeGreaterThan(0);
        expect(maxOfKind, 'burst-into projectile').toBeGreaterThan(0);
      }
    }
  });
});
