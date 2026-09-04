import type { MatchMode } from '../rules/settings';
import { WEAPON_DEFS } from './defs';
import { LAUNCH_WEAPONS, launchWeaponDef } from './launch';
import type { WeaponDef } from './schema';

/** The weapon table a match plays with: the base defs as they are, or the launch overlay applied. */
export function resolveWeaponDefs(mode: MatchMode): WeaponDef[] {
  if (mode !== 'launch') return WEAPON_DEFS;
  return WEAPON_DEFS.map(launchWeaponDef);
}

/** Look up a resolved def by index (indices are shared with the base table, so ids stay stable on the wire). */
export function weaponDef(weapons: readonly WeaponDef[], index: number): WeaponDef {
  const def = weapons[index];
  if (!def) throw new Error(`Unknown weapon index ${index}`);
  return def;
}

/**
 * What the sky can drop. With everything enabled, launch mode narrows the pool to its curated
 * list; an explicit selection is honoured in either mode.
 */
export function droppableWeapons(weapons: readonly WeaponDef[], enabled: string[] | 'all', mode: MatchMode = 'standing'): WeaponDef[] {
  const allowed = enabled === 'all' ? (mode === 'launch' ? LAUNCH_WEAPONS : null) : enabled;
  return weapons.filter((d) => d.dropWeight > 0 && (allowed === null || allowed.includes(d.id)));
}
