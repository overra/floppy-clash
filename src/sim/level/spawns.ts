import type { SeededRng } from '../../core/rng';

export type SpawnPos = { x: number; y: number };

/**
 * Picks a spawn position per player. Spawn points are shuffled so seats don't always get the
 * same corner; when a level has fewer spawns than players, the extras fan out sideways so
 * nobody starts stacked inside another body.
 */
export function spawnPositions(spawns: readonly SpawnPos[], count: number, rng: SeededRng, fixed = false): SpawnPos[] {
  if (spawns.length === 0) {
    return Array.from({ length: count }, (_, i) => ({ x: 6 + i * 2, y: 7 }));
  }
  // Fixed spawns: slot k always takes point k, so nothing about the opening depends on the seed.
  const order = fixed ? spawns.slice() : rng.shuffle(spawns.slice());
  const out: SpawnPos[] = [];
  for (let i = 0; i < count; i++) {
    const s = order[i % order.length]!;
    const round = Math.floor(i / order.length);
    const side = round === 0 ? 0 : (round % 2 === 1 ? 1 : -1) * Math.ceil(round / 2) * 0.9;
    let x = s.x + side;
    // Authored spawns sometimes sit on the same column at different heights; nudge apart so
    // one player never drops onto another's head at "FIGHT".
    for (let guard = 0; guard < 4; guard++) {
      const clash = out.find((o) => Math.abs(o.x - x) < 0.9);
      if (!clash) break;
      x += x >= clash.x ? 0.9 : -0.9;
    }
    out.push({ x, y: s.y + 1 });
  }
  return out;
}
