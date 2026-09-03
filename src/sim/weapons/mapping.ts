/**
 * PLAN Appendix C range / duration mapping.
 *
 * Accept language is a range or a duration, not a single midpoint. Midpoints in
 * `projectile.damage` are display fallbacks only — live damage must use the mapping.
 *
 * - Hitscan / pellets / melee / droplets (`damageMin`/`damageMax`):
 *   uniform roll [min, max) per projectile via the seeded sim RNG.
 * - Explosives / AoE (`explodeDamageMin`/`explodeDamageMax`):
 *   linear distance map `min + (max-min)*falloff` (same shape as barrels 10–55).
 * - Burst fragments (`burstDamageMin`/`burstDamageMax`):
 *   uniform roll [min, max) per fragment.
 * - Hold-to-fire duration (`holdSeconds`):
 *   `ammo = round(seconds * PLAN_TICK_RATE / fireIntervalTicks)`.
 *   Lava stream: ~60/s comes from damage 1 × overlapping `beamTicks` 2 at
 *   `fireIntervalTicks` 2 (30 beams/s × 2 tick-hits = 60 HP/s) for 10 s → ammo 300.
 *   Flamethrower: ~5 s at interval 2 → ammo 150; burn 5/s for 6 s is tuning, not ammo.
 * - M16 "30 bursts": `ammo` counts burst sequences; one trigger consumes 1 ammo and
 *   fires `burstCount` rounds.
 * - RPG "300+": explodeDamageMin=Max=300 so a blast deals at least 300 (the
 *   published floor). No published ceiling — we do not invent damage above 300.
 */

export const PLAN_TICK_RATE = 60;

export function holdAmmoFromSeconds(
  seconds: number,
  fireIntervalTicks: number,
  tickRate = PLAN_TICK_RATE,
): number {
  return Math.round((seconds * tickRate) / fireIntervalTicks);
}

export function rollRange(rng: { next(): number }, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

export function rollIfRanged(
  rng: { next(): number },
  min: number | undefined,
  max: number | undefined,
  fallback: number,
): number {
  if (min != null && max != null) return rollRange(rng, min, max);
  return fallback;
}

export function explodeDamageAt(
  falloff: number,
  opts: {
    explodeDamageMin?: number;
    explodeDamageMax?: number;
    explodeDamage: number;
    damage: number;
    rolled?: number;
  },
): number {
  if (opts.explodeDamageMin != null && opts.explodeDamageMax != null) {
    return opts.explodeDamageMin + (opts.explodeDamageMax - opts.explodeDamageMin) * falloff;
  }
  // `rolled` of 0 is thruster's push, not a silent 0 blast — prefer explodeDamage (15).
  // Explicit explodeDamage 0 (snake-grenade, glue, flame) must not fall back to shot damage.
  if (opts.explodeDamage) return opts.explodeDamage * falloff;
  if (opts.rolled) return opts.rolled * falloff;
  return 0;
}
