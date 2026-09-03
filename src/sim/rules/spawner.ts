import { type World } from 'koota';
import { getContext } from '../context';
import { raycastClosest } from '../physics/queries';
import { DropState, Loose, RoundPhase, RoundState, Weapon } from '../traits';
import { droppableWeapons } from '../weapons/defs';
import { spawnWeapon } from '../weapons/systems';

export function spawner(world: World): void {
  const ctx = getContext(world);
  const round = world.get(RoundState);
  const drop = world.get(DropState);
  if (!round || !drop || !ctx.level.drops?.enabled) return;
  if (round.phase !== RoundPhase.Fighting && round.phase !== RoundPhase.Countdown) return;

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
  // A crate that falls straight into the void is a wasted drop: prefer columns with ground under them.
  let x = ctx.rng.range(ctx.level.drops.xMin, ctx.level.drops.xMax);
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? x : ctx.rng.range(ctx.level.drops.xMin, ctx.level.drops.xMax);
    const ground = raycastClosest(world, candidate, y, candidate, bounds.y - 1, (h) => h.kind !== 'solid' && h.kind !== 'prop');
    if (ground) {
      x = candidate;
      break;
    }
  }
  spawnWeapon(world, def.id, x, y);
  // More fighters burn through more guns: tighten the cadence as the lobby grows.
  const crowd = 1 + 0.15 * Math.max(0, ctx.players.length - 2);
  const scale = (ctx.level.drops.intervalScale ?? 1) / crowd;
  drop.nextDrop =
    ctx.tick +
    Math.floor(ctx.rng.range(ctx.tuning.dropIntervalMinTicks, ctx.tuning.dropIntervalMaxTicks) * scale);
  world.set(DropState, drop);
}
