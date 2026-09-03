import { describe, expect, it } from 'vitest';
import { replication } from '../src/sim/traits';
import { WEAPON_BY_ID, WEAPON_DEFS, weaponDisplayName } from '../src/sim/weapons/defs';
import { holdAmmoFromSeconds } from '../src/sim/weapons/mapping';

type ParityRow = {
  id: string;
  ammo: number;
  kind: string;
  damage?: number;
  damageMin?: number;
  damageMax?: number;
  explodeDamageMin?: number;
  explodeDamageMax?: number;
  burstDamageMin?: number;
  burstDamageMax?: number;
  holdSeconds?: number;
  burstCount?: number;
  count?: number;
};

/** Appendix C defaults — ranges/durations are pinned as ranges/durations, not midpoints. */
const PARITY: ParityRow[] = [
  { id: 'fists', damage: 22, ammo: 999, kind: 'melee' },
  { id: 'pistol', damage: 32, ammo: 15, kind: 'bullet' },
  { id: 'revolver', damage: 44, ammo: 6, kind: 'bullet' },
  { id: 'deagle', damage: 56, ammo: 15, kind: 'bullet' },
  { id: 'uzi', damage: 14, ammo: 40, kind: 'bullet' },
  { id: 'god-pistol', damageMin: 30, damageMax: 60, ammo: 999, kind: 'bullet' },
  { id: 'ak47', damage: 23, ammo: 30, kind: 'bullet' },
  { id: 'm16', damage: 20, ammo: 30, kind: 'bullet', burstCount: 3 },
  { id: 'm1', damage: 35, ammo: 8, kind: 'bullet' },
  { id: 'sniper', damage: 75, ammo: 5, kind: 'bullet' },
  { id: 'sawed-off', damageMin: 10, damageMax: 30, ammo: 10, kind: 'pellets', count: 5 },
  { id: 'military-shotgun', damageMin: 5, damageMax: 6, ammo: 10, kind: 'pellets', count: 5 },
  { id: 'bouncer', damage: 45, ammo: 30, kind: 'bullet' },
  { id: 'grenade-launcher', explodeDamageMin: 50, explodeDamageMax: 80, ammo: 5, kind: 'grenade' },
  { id: 'thruster', damage: 0, ammo: 20, kind: 'rocket' },
  { id: 'rpg', damage: 300, explodeDamageMin: 300, explodeDamageMax: 300, ammo: 3, kind: 'rocket' },
  { id: 'snake-gun', damage: 5, ammo: 6, kind: 'creature' },
  { id: 'snake-shotgun', damage: 5, ammo: 10, kind: 'creature', count: 3 },
  { id: 'snake-grenade', damage: 5, ammo: 5, kind: 'burst-into' },
  { id: 'snake-launcher', damage: 25, ammo: 3, kind: 'creature' },
  { id: 'snake-minigun', damage: 5, ammo: 40, kind: 'creature' },
  { id: 'flying-snake-launcher', damage: 25, ammo: 3, kind: 'creature' },
  { id: 'lava-spike-ball', burstDamageMin: 20, burstDamageMax: 40, ammo: 5, kind: 'burst-into', count: 1 },
  { id: 'lava-beam', damage: 215, ammo: 25, kind: 'beam' },
  { id: 'lava-stream', damage: 1, ammo: holdAmmoFromSeconds(10, 2), holdSeconds: 10, kind: 'beam' },
  { id: 'lava-spray', damageMin: 5, damageMax: 20, ammo: 40, kind: 'grenade' },
  {
    id: 'lava-spike-gun',
    damageMin: 10,
    damageMax: 15,
    explodeDamageMin: 10,
    explodeDamageMax: 15,
    burstDamageMin: 5,
    burstDamageMax: 10,
    ammo: 25,
    kind: 'burst-into',
  },
  { id: 'sword', damage: 68, ammo: 999, kind: 'melee' },
  { id: 'spear', damage: 20, ammo: 999, kind: 'melee' },
  { id: 'blink-dagger', damageMin: 22, damageMax: 50, ammo: 25, kind: 'melee' },
  { id: 'time-bubble', damage: 12.5, ammo: 5, kind: 'field' },
  { id: 'laser', damage: 10, ammo: 60, kind: 'bullet' },
  { id: 'ice-gun', damage: 7.7, ammo: 40, kind: 'bullet' },
  { id: 'black-hole', damage: 999, ammo: 1, kind: 'field' },
  { id: 'glue-gun', damage: 5, ammo: 40, kind: 'field' },
  { id: 'minigun', damage: 5, ammo: 200, kind: 'bullet' },
  { id: 'flamethrower', damage: 0.2, ammo: holdAmmoFromSeconds(5, 2), holdSeconds: 5, kind: 'field' },
];

describe('Appendix C parity defaults', () => {
  it('pins the full roster ammo / kind / PLAN ranges and distinctive display names', () => {
    expect(WEAPON_DEFS.length).toBe(PARITY.length);
    for (const row of PARITY) {
      const def = WEAPON_BY_ID.get(row.id)?.def;
      expect(def, row.id).toBeTruthy();
      expect(def!.ammo, `${row.id} ammo`).toBe(row.ammo);
      expect(def!.projectile.kind, `${row.id} kind`).toBe(row.kind);
      if (row.damageMin != null && row.damageMax != null) {
        expect(def!.projectile.damageMin, `${row.id} damageMin`).toBe(row.damageMin);
        expect(def!.projectile.damageMax, `${row.id} damageMax`).toBe(row.damageMax);
      } else if (row.damage != null) {
        expect(def!.projectile.damage, `${row.id} damage`).toBe(row.damage);
        expect(def!.projectile.damageMin, `${row.id} no silent range`).toBeUndefined();
        expect(def!.projectile.damageMax, `${row.id} no silent range`).toBeUndefined();
      }
      if (row.explodeDamageMin != null) {
        expect(def!.projectile.explodeDamageMin).toBe(row.explodeDamageMin);
        expect(def!.projectile.explodeDamageMax).toBe(row.explodeDamageMax);
      }
      if (row.burstDamageMin != null) {
        expect(def!.projectile.burstDamageMin).toBe(row.burstDamageMin);
        expect(def!.projectile.burstDamageMax).toBe(row.burstDamageMax);
      }
      if (row.holdSeconds != null) {
        expect(def!.holdSeconds).toBe(row.holdSeconds);
        expect(def!.ammo).toBe(holdAmmoFromSeconds(row.holdSeconds, def!.fireIntervalTicks));
      }
      if (row.burstCount != null) expect(def!.burstCount).toBe(row.burstCount);
      if (row.count != null) expect(def!.projectile.count).toBe(row.count);
    }
    expect(WEAPON_BY_ID.get('lava-spray')?.def.projectile.fuse).toBe(0);
    expect(WEAPON_BY_ID.get('lava-spike-ball')?.def.projectile.burstCount).toBe(25);
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
