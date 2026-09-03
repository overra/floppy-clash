import { type World } from 'koota';
import { getContext } from '../context';
import { DropState, Loose, RoundPhase, RoundState, Weapon } from '../traits';
import { droppableWeapons } from '../weapons/defs';
import { spawnWeapon } from './weapons';

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
  const x = ctx.rng.range(ctx.level.drops.xMin, ctx.level.drops.xMax);
  const y = ctx.level.bounds.y + ctx.level.bounds.h + 1.5;
  spawnWeapon(world, def.id, x, y);
  const scale = ctx.level.drops.intervalScale ?? 1;
  drop.nextDrop =
    ctx.tick +
    Math.floor(ctx.rng.range(ctx.tuning.dropIntervalMinTicks, ctx.tuning.dropIntervalMaxTicks) * scale);
  world.set(DropState, drop);
}
