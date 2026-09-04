import { type World } from 'koota';
import { getContext } from '../context';
import { raycastClosest } from '../physics/queries';
import { DropState, Loose, RoundPhase, RoundState, Weapon } from '../traits';
import { droppableWeapons } from '../weapons/defs';
import { spawnWeapon } from '../weapons/systems';

/** Ticks between the guns of the opening volley: a quick sweep across the arena, not one big clatter. */
const WAVE_GAP_TICKS = 8;

/**
 * Called as "FIGHT" flashes. Nothing falls during the countdown (a gun landing beside one fighter
 * before anyone can move is a free win), and the first thing to fall is a volley of one gun per
 * fighter, each over its own slice of the arena, so nobody starts the round as the only one armed.
 */
/** `low` items: no opening volley, and every wait between drops is this many times longer. */
const LOW_ITEMS_SLOWDOWN = 3;

export function openDrops(world: World): void {
  const ctx = getContext(world);
  const drop = world.get(DropState);
  if (!drop) return;
  const items = ctx.settings.items;
  const size = items === 'normal' ? Math.min(ctx.players.length, ctx.tuning.maxLooseWeapons) : 0;
  world.set(DropState, {
    ...drop,
    nextDrop: ctx.tick + ctx.tuning.firstDropDelayTicks * (items === 'low' ? LOW_ITEMS_SLOWDOWN : 1),
    wave: size,
    waveSize: size,
  });
}

export function spawner(world: World): void {
  const ctx = getContext(world);
  const round = world.get(RoundState);
  const drop = world.get(DropState);
  if (!round || !drop || !ctx.level.drops?.enabled || ctx.settings.items === 'off') return;
  if (round.phase !== RoundPhase.Fighting) return;

  let loose = 0;
  world.query(Weapon, Loose).forEach(() => {
    loose += 1;
  });
  drop.looseCount = loose;
  if (ctx.tick < drop.nextDrop) {
    world.set(DropState, drop);
    return;
  }
  if (loose >= ctx.tuning.maxLooseWeapons) return;

  const pool = droppableWeapons(ctx.settings.enabledWeapons);
  if (pool.length === 0) return;
  const weights = pool.map((w) => w.dropWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = ctx.rng.next() * total;
  let def = pool[0]!;
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i]!;
    if (pick <= 0) {
      def = pool[i]!;
      break;
    }
  }
  const { bounds } = ctx.level;
  const y = bounds.y + bounds.h + 1.5;
  const { xMin, xMax } = ctx.level.drops;
  // The opening volley walks the arena in equal slices so every fighter has a gun land nearby;
  // afterwards drops land anywhere.
  const inWave = drop.wave > 0;
  const slice = inWave ? (xMax - xMin) / drop.waveSize : xMax - xMin;
  const lo = inWave ? xMin + slice * (drop.waveSize - drop.wave) : xMin;
  const hi = lo + slice;
  // A crate that falls straight into the void is a wasted drop: prefer columns with ground under them.
  let x = ctx.rng.range(lo, hi);
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? x : ctx.rng.range(lo, hi);
    const ground = raycastClosest(world, candidate, y, candidate, bounds.y - 1, (h) => h.kind !== 'solid' && h.kind !== 'prop');
    if (ground) {
      x = candidate;
      break;
    }
  }
  spawnWeapon(world, def.id, x, y);
  if (inWave) {
    drop.wave -= 1;
  }
  if (drop.wave > 0) {
    drop.nextDrop = ctx.tick + WAVE_GAP_TICKS;
  } else {
    // More fighters burn through more guns: tighten the cadence as the lobby grows.
    const crowd = 1 + 0.15 * Math.max(0, ctx.players.length - 2);
    const scale = ((ctx.level.drops.intervalScale ?? 1) / crowd) * (ctx.settings.items === 'low' ? LOW_ITEMS_SLOWDOWN : 1);
    drop.nextDrop =
      ctx.tick +
      Math.floor(ctx.rng.range(ctx.tuning.dropIntervalMinTicks, ctx.tuning.dropIntervalMaxTicks) * scale);
  }
  world.set(DropState, drop);
}
