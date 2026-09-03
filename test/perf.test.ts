import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { makeSim } from './helpers';

describe('performance budgets', () => {
  it('physics step stays bounded with 4 players and props', () => {
    const sim = makeSim({ level: woodsClearing, seed: 7, settings: { playerCount: 4 }, boxes: 20 });
    const samples: number[] = [];
    for (let i = 0; i < 180; i++) {
      sim.step();
      samples.push(sim.ctx.lastPhysicsMs);
    }
    const steady = samples.slice(60).sort((a, b) => a - b);
    const median = steady[Math.floor(steady.length / 2)] ?? 0;
    const worst = samples.reduce((a, b) => Math.max(a, b), 0);
    expect(median).toBeLessThan(8);
    expect(worst).toBeLessThan(80);
    expect(samples.every((ms) => Number.isFinite(ms))).toBe(true);
  });
});
