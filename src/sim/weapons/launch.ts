import type { WeaponDef } from './schema';

/**
 * Launch-mode weapon balance. Knockback there scales with the victim's percent, so anything that
 * lands many small shoves per second (sprayers, hoses, five-pellet scatters) would hose fighters
 * off the stage; those get a small `launchScale`. Single committed hits get a little extra, and
 * melee weapons, the mode's bread and butter, get the most. Attrition weapons (snakes, magma) drop
 * rarely: they build percent without ever finishing anyone.
 */
export type WeaponOverlay = Partial<Pick<WeaponDef, 'knockback' | 'launchScale' | 'thrownDamage' | 'dropWeight' | 'ammo' | 'fireIntervalTicks'>> & {
  damage?: number;
  explodeImpulse?: number;
};

export const LAUNCH_OVERLAY: Record<string, WeaponOverlay> = {
  // Rapid fire: many tiny shoves.
  uzi: { launchScale: 0.35 },
  minigun: { launchScale: 0.3, dropWeight: 0.25 },
  ak47: { launchScale: 0.5 },
  m16: { launchScale: 0.6 },
  flamethrower: { launchScale: 0.3 },
  'lava-stream': { launchScale: 0.35, dropWeight: 0.1 },
  'lava-spray': { launchScale: 0.4, dropWeight: 0.1 },
  'glue-gun': { launchScale: 0.5 },
  'snake-minigun': { launchScale: 0.4, dropWeight: 0.05 },
  // Scatter: every pellet shoves.
  'sawed-off': { launchScale: 0.35 },
  'military-shotgun': { launchScale: 0.4 },
  // Single committed shots.
  revolver: { launchScale: 1.2 },
  deagle: { launchScale: 1.3 },
  sniper: { launchScale: 1.5 },
  m1: { launchScale: 1.1 },
  bouncer: { launchScale: 0.8 },
  'grenade-launcher': { launchScale: 0.9 },
  thruster: { launchScale: 1.1 },
  rpg: { launchScale: 0.8, dropWeight: 0.1 },
  // Melee: the mode's core.
  sword: { launchScale: 1.25 },
  spear: { launchScale: 1.2 },
  'blink-dagger': { launchScale: 1.1 },
  slugger: { launchScale: 1.2 },
  mallet: { launchScale: 1.1 },
  // Attrition: builds percent, never finishes.
  'snake-gun': { dropWeight: 0.1 },
  'snake-shotgun': { dropWeight: 0.08 },
  'snake-grenade': { dropWeight: 0.06 },
  'snake-launcher': { dropWeight: 0.05 },
  'flying-snake-launcher': { dropWeight: 0.04 },
  'lava-spike-ball': { dropWeight: 0.1 },
  'lava-beam': { launchScale: 0.6, dropWeight: 0.1 },
  'lava-spike-gun': { dropWeight: 0.1 },
};

/** Thrown weapons in launch mode: a shove first (see projectiles.ts), and this much percent at most. */
export const LAUNCH_THROWN_DAMAGE = 20;

/**
 * What rains when every weapon is enabled in launch mode: melee, single big hits and utility, no
 * snakes or magma. Picking weapons by hand in the settings still puts anything in the sky.
 */
export const LAUNCH_WEAPONS: readonly string[] = [
  'pistol',
  'revolver',
  'deagle',
  'sawed-off',
  'm1',
  'sniper',
  'bouncer',
  'grenade-launcher',
  'thruster',
  'rpg',
  'sword',
  'spear',
  'blink-dagger',
  'time-bubble',
  'laser',
  'ice-gun',
  'black-hole',
  'glue-gun',
  'slugger',
  'walker-mine',
  'mallet',
  'repulsor-puck',
];

/** Apply the launch overlay to one base def: knockback folds in launchScale, thrown damage is capped. */
export function launchWeaponDef(base: WeaponDef): WeaponDef {
  const o = LAUNCH_OVERLAY[base.id] ?? {};
  const launchScale = o.launchScale ?? base.launchScale;
  const projectile = { ...base.projectile };
  if (o.damage !== undefined) projectile.damage = o.damage;
  if (o.explodeImpulse !== undefined) projectile.explodeImpulse = o.explodeImpulse;
  return {
    ...base,
    projectile,
    launchScale,
    knockback: (o.knockback ?? base.knockback) * launchScale,
    thrownDamage: Math.min(o.thrownDamage ?? base.thrownDamage, LAUNCH_THROWN_DAMAGE),
    dropWeight: o.dropWeight ?? base.dropWeight,
    ammo: o.ammo ?? base.ammo,
    fireIntervalTicks: o.fireIntervalTicks ?? base.fireIntervalTicks,
  };
}
