import { describe, expect, it } from 'vitest';
import { replication } from '../src/sim/traits';
import { WEAPON_BY_ID, WEAPON_DEFS, weaponDisplayName } from '../src/sim/weapons/defs';

/** Appendix C defaults — ids stay stable; public names are distinctive (PLAN §9). */
const PARITY: { id: string; damage: number; ammo: number; kind: string }[] = [
  { id: 'fists', damage: 22, ammo: 999, kind: 'melee' },
  { id: 'pistol', damage: 32, ammo: 15, kind: 'bullet' },
  { id: 'revolver', damage: 44, ammo: 6, kind: 'bullet' },
  { id: 'deagle', damage: 56, ammo: 15, kind: 'bullet' },
  { id: 'uzi', damage: 14, ammo: 40, kind: 'bullet' },
  { id: 'god-pistol', damage: 45, ammo: 999, kind: 'bullet' },
  { id: 'ak47', damage: 23, ammo: 30, kind: 'bullet' },
  { id: 'm16', damage: 20, ammo: 30, kind: 'bullet' },
  { id: 'm1', damage: 35, ammo: 8, kind: 'bullet' },
  { id: 'sniper', damage: 75, ammo: 5, kind: 'bullet' },
  { id: 'sawed-off', damage: 18, ammo: 10, kind: 'pellets' },
  { id: 'military-shotgun', damage: 5.5, ammo: 10, kind: 'pellets' },
  { id: 'bouncer', damage: 45, ammo: 30, kind: 'bullet' },
  { id: 'grenade-launcher', damage: 65, ammo: 5, kind: 'grenade' },
  { id: 'thruster', damage: 0, ammo: 20, kind: 'rocket' },
  { id: 'rpg', damage: 300, ammo: 3, kind: 'rocket' },
  { id: 'snake-gun', damage: 5, ammo: 6, kind: 'creature' },
  { id: 'snake-shotgun', damage: 5, ammo: 10, kind: 'creature' },
  { id: 'snake-grenade', damage: 5, ammo: 5, kind: 'burst-into' },
  { id: 'snake-launcher', damage: 25, ammo: 3, kind: 'creature' },
  { id: 'snake-minigun', damage: 5, ammo: 40, kind: 'creature' },
  { id: 'flying-snake-launcher', damage: 25, ammo: 3, kind: 'creature' },
  { id: 'lava-spike-ball', damage: 30, ammo: 5, kind: 'burst-into' },
  { id: 'lava-beam', damage: 215, ammo: 25, kind: 'beam' },
  { id: 'lava-stream', damage: 1, ammo: 600, kind: 'beam' },
  { id: 'lava-spray', damage: 12, ammo: 40, kind: 'grenade' },
  { id: 'lava-spike-gun', damage: 12, ammo: 25, kind: 'burst-into' },
  { id: 'sword', damage: 68, ammo: 999, kind: 'melee' },
  { id: 'spear', damage: 20, ammo: 999, kind: 'melee' },
  { id: 'blink-dagger', damage: 36, ammo: 25, kind: 'melee' },
  { id: 'time-bubble', damage: 12.5, ammo: 5, kind: 'field' },
  { id: 'laser', damage: 10, ammo: 60, kind: 'bullet' },
  { id: 'ice-gun', damage: 7.7, ammo: 40, kind: 'bullet' },
  { id: 'black-hole', damage: 999, ammo: 1, kind: 'field' },
  { id: 'glue-gun', damage: 5, ammo: 40, kind: 'field' },
  { id: 'minigun', damage: 5, ammo: 200, kind: 'bullet' },
  { id: 'flamethrower', damage: 0.2, ammo: 300, kind: 'field' },
];

describe('Appendix C parity defaults', () => {
  it('pins the full roster damage / ammo / kind and distinctive display names', () => {
    expect(WEAPON_DEFS.length).toBe(PARITY.length);
    for (const row of PARITY) {
      const def = WEAPON_BY_ID.get(row.id)?.def;
      expect(def, row.id).toBeTruthy();
      expect(def!.projectile.damage).toBe(row.damage);
      expect(def!.ammo).toBe(row.ammo);
      expect(def!.projectile.kind).toBe(row.kind);
    }
    expect(WEAPON_BY_ID.get('lava-spray')?.def.projectile.fuse).toBe(0);
    expect(weaponDisplayName('god-pistol')).toBe('Oracle Pistol');
    expect(weaponDisplayName('black-hole')).toBe('Void Well');
    expect(weaponDisplayName('blink-dagger')).toBe('Blink Knife');
  });

  it('declares a replication class for every sim trait', () => {
    const required = [
      'Transform',
      'PrevTransform',
      'PhysBody',
      'NetId',
      'Player',
      'Controller',
      'Aim',
      'Health',
      'Combat',
      'Weapon',
      'Projectile',
      'Hazard',
      'RagdollPart',
      'Lifetime',
      'Dead',
      'Loose',
      'Held',
      'Static',
      'Kinematic',
      'Status',
      'Snake',
      'Bot',
      'Boss',
      'PhysArm',
      'Crown',
      'Solid',
      'Sensor',
      'Destructible',
      'SpawnPoint',
      'PunchHit',
      'RoundState',
      'MatchState',
      'SimClock',
      'DropState',
      'HazardPath',
    ];
    for (const name of required) {
      expect(replication[name as keyof typeof replication], name).toMatch(/replicated|local/);
    }
  });
});
