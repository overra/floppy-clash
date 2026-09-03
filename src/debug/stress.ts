/**
 * A reproducible "intense battle" for profiling: every fighter is kept armed with a heavy weapon
 * and the particle field is topped up with synthetic gore, explosions and muzzle flashes around
 * the fighters until it reaches a target density. Shared by the in-game stress switch
 * (`window.__floppy.stress(n)` / `?stress=n`) and the headless perf tests, so the browser and the
 * test suite measure the same scene.
 */
import type { SimEvents } from '../sim/events';
import { Dead, Held, HeldBy, Transform, Weapon } from '../sim/traits';
import { spawnWeapon } from '../sim/weapons/systems';
import type { SimHandle } from '../sim/world';

/** The roster's particle-heaviest guns: explosions, flame, high fire rate. */
export const HEAVY_WEAPONS = ['rpg', 'grenade-launcher', 'minigun', 'flamethrower', 'lava-spray', 'military-shotgun', 'snake-minigun', 'uzi'];

/** Small deterministic generator so a stress run is the same scene every time. */
export function makeStressRng(seed = 12345): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Hands every unarmed, living fighter a heavy weapon. Call every so often (the ammo runs out). */
export function armFighters(sim: SimHandle, rng: () => number): void {
  const armed = new Set<number>();
  for (const w of sim.ecs.query(Weapon, Held)) {
    const holder = w.targetFor(HeldBy);
    if (holder !== undefined) armed.add(holder as unknown as number);
  }
  for (const p of sim.players()) {
    if (p.has(Dead) || armed.has(p as unknown as number)) continue;
    const t = p.get(Transform);
    if (!t) continue;
    const id = HEAVY_WEAPONS[Math.floor(rng() * HEAVY_WEAPONS.length)]!;
    spawnWeapon(sim.ecs, id, t.x, t.y, false).add(Held(), HeldBy(p));
  }
}

/**
 * Synthetic effects for one tick: a burst of blood, a coin-flip explosion and a muzzle flash at
 * each fighter. Feed the result to `emitFromEvents` while the live particle count is below the
 * target; a couple of ticks of this fills a battlefield.
 */
export function stressEvents(sim: SimHandle, rng: () => number): SimEvents {
  const out: SimEvents = [];
  for (const p of sim.players()) {
    const t = p.get(Transform);
    if (!t) continue;
    out.push({ type: 'blood', x: t.x + rng() - 0.5, y: t.y + rng() - 0.5, amount: 60 });
    if (rng() < 0.5) out.push({ type: 'explosion', x: t.x + rng() * 2 - 1, y: t.y + rng() * 2 - 1, radius: 2.5, damage: 0 });
    out.push({ type: 'shot', source: 0, weaponId: 'uzi', x: t.x, y: t.y, aimX: 1, aimY: 0 });
  }
  return out;
}
