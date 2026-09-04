import { describe, expect, it } from 'vitest';
import { universe } from 'koota';
import { attachBots } from '../src/sim/ai/bots';
import { navFor, routeStep, surfaceUnderFeet } from '../src/sim/ai/nav';
import { builtInMatchLevels } from '../src/levels/catalog';
import { createSimWorld } from '../src/sim/world';
import { Bot, Health, Player, RoundPhase, RoundState, Transform } from '../src/sim/traits';
import { makeSim } from './helpers';

/** Yield a macrotask so vitest's worker can answer the runner while a long sync sweep is in progress. */
const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('M9 bots', () => {
  it('bots produce inputs and the match advances', () => {
    const sim = makeSim({ seed: 90, settings: { playerCount: 1, bots: 3 } });
    const slots: number[] = [];
    sim.ecs.query(Player).updateEach(([p], e) => {
      if (p.slot > 0) {
        e.add(Bot({ slot: p.slot, think: 0 }));
        slots.push(p.slot);
      }
    });
    attachBots(sim.ecs, slots);
    const start = sim.getTick();
    expect(() => {
      for (let i = 0; i < 240; i++) sim.step();
    }).not.toThrow();
    expect(sim.getTick()).toBe(start + 240);
  });

  it('routes across the surface graph of every arena from every spawn to every other spawn', () => {
    for (const level of builtInMatchLevels()) {
      const nav = navFor(level);
      const spawnSurfs = level.spawns.map((s) => surfaceUnderFeet(nav, s.x, s.y - 1.5 + 0.05, 3.2));
      for (const a of spawnSurfs) {
        expect(a, `${level.id}: spawn has no static surface`).toBeGreaterThanOrEqual(0);
        for (const b of spawnSurfs) {
          if (a === b) continue;
          expect(routeStep(nav, a, b), `${level.id}: no route between spawn surfaces ${a} -> ${b}`).not.toBeNull();
        }
      }
    }
  });

  it('hops a spike strip between itself and its target instead of walking into it', () => {
    const base = builtInMatchLevels()[0]!;
    const level = {
      ...base,
      id: 'test-spike-hop',
      bounds: { x: 0, y: 0, w: 24, h: 14 },
      spawns: [
        { x: 19, y: 3.5 },
        { x: 4, y: 3.5 },
      ],
      drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'spikes' as const, x: 11, y: 2.35, w: 2, h: 0.5, dir: 'up' as const },
      ],
    };
    universe.reset();
    const sim = createSimWorld({ level, seed: 3, settings: { playerCount: 1, bots: 1 } });
    attachBots(sim.ecs, [1]);
    let reached = false;
    for (let t = 0; t < 120 + 240 && !reached; t++) {
      sim.step();
      sim.ecs.query(Player, Transform, Bot).updateEach(([, tr]) => {
        if (tr.x > 13.5) reached = true;
      });
    }
    const bot = sim.ecs.query(Player, Bot).map((e) => e.get(Health)!.hp)[0];
    expect(bot).toBeGreaterThan(0);
    expect(reached).toBe(true);
  });

  it('a bots-only match survives rotating from a busy arena to a sparse one (stale nav indices must not route)', async () => {
    // Surface indices remembered on the big arena are out of range on the small one.
    const levels = builtInMatchLevels().map((l) => ({ l, n: navFor(l).surfaces.length })).sort((a, b) => b.n - a.n);
    const big = levels[0]!.l;
    const small = levels[levels.length - 1]!.l;
    expect(navFor(big).surfaces.length).toBeGreaterThan(navFor(small).surfaces.length + 2);
    universe.reset();
    const sim = createSimWorld({
      level: big,
      seed: 21,
      settings: { playerCount: 0, bots: 4, firstTo: 0, rotation: 'ordered', enabledLevels: [big.id, small.id] },
    });
    attachBots(sim.ecs, [0, 1, 2, 3]);
    sim.ctx.tuning.slowmoTicks = 2;
    sim.ctx.tuning.scoreboardTicks = 2;
    const seen = new Set<string>();
    let rounds = 0;
    await expect(
      (async () => {
        for (let t = 0; t < 60 * 60 * 4 && rounds < 6; t++) {
          if (t % 600 === 0) await breathe();
          for (const ev of sim.step()) if (ev.type === 'round-phase' && ev.phase === 'countdown') rounds += 1;
          seen.add(sim.ctx.level.id);
        }
      })(),
    ).resolves.toBeUndefined();
    expect(rounds).toBeGreaterThanOrEqual(4);
    expect(seen).toEqual(new Set([big.id, small.id]));
  }, 60_000);

  it('four bots settle a round on every built-in arena without stacking or stalling', async () => {
    const report: string[] = [];
    for (const level of builtInMatchLevels()) {
      // A minute of solid physics would starve the worker's RPC channel; breathe between arenas.
      await breathe();
      universe.reset();
      const sim = createSimWorld({ level, seed: 7, settings: { playerCount: 0, bots: 4 } });
      attachBots(sim.ecs, [0, 1, 2, 3]);
      let kills = 0;
      let resolvedTick = -1;
      let stackTicks = 0;
      for (let t = 0; t < 60 * 60; t++) {
        for (const ev of sim.step()) if (ev.type === 'kill') kills += 1;
        const alive = sim.ecs
          .query(Player, Transform, Health)
          .map((e) => ({ p: e.get(Transform)!, hp: e.get(Health)?.hp ?? 0 }))
          .filter((p) => p.hp > 0);
        if (t > 120 && t % 30 === 0) {
          for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
              if (Math.abs(alive[i]!.p.x - alive[j]!.p.x) < 0.25 && Math.abs(alive[i]!.p.y - alive[j]!.p.y) < 1.4) stackTicks += 1;
            }
          }
        }
        const rs = sim.ecs.get(RoundState);
        if (rs && rs.phase >= RoundPhase.LastKill) {
          resolvedTick = t;
          break;
        }
      }
      // Nobody should die before "FIGHT" (tick 120), rounds should end inside a minute with the
      // kills coming from combat, and bots should never sit on top of each other.
      if (resolvedTick < 0 || resolvedTick < 130 || kills < 3 || stackTicks > 6) {
        report.push(`${level.id}: resolved=${resolvedTick} kills=${kills} stack=${stackTicks}`);
      }
    }
    expect(report).toEqual([]);
  }, 120_000);
});
