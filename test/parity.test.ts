import { describe, expect, it } from 'vitest';
import { WEAPON_BY_ID, weaponDisplayName } from '../src/sim/weapons/defs';

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
  { id: 'rpg', damage: 300, ammo: 3, kind: 'rocket' },
  { id: 'snake-gun', damage: 5, ammo: 6, kind: 'creature' },
  { id: 'lava-beam', damage: 215, ammo: 25, kind: 'beam' },
  { id: 'sword', damage: 68, ammo: 999, kind: 'melee' },
  { id: 'time-bubble', damage: 12.5, ammo: 5, kind: 'field' },
  { id: 'minigun', damage: 5, ammo: 200, kind: 'bullet' },
];

describe('Appendix C parity defaults', () => {
  it('pins roster damage / ammo / kind and distinctive display names', () => {
    for (const row of PARITY) {
      const def = WEAPON_BY_ID.get(row.id)?.def;
      expect(def, row.id).toBeTruthy();
      expect(def!.projectile.damage).toBe(row.damage);
      expect(def!.ammo).toBe(row.ammo);
      expect(def!.projectile.kind).toBe(row.kind);
    }
    expect(weaponDisplayName('god-pistol')).toBe('Oracle Pistol');
    expect(weaponDisplayName('black-hole')).toBe('Void Well');
    expect(weaponDisplayName('blink-dagger')).toBe('Blink Knife');
  });
});
