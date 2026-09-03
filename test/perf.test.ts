import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { packGroups } from '../src/render/gpu/pack';
import { PRIM_DISK } from '../src/render/sdf/primitives';
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

  it('CPU frame build stays bounded (CI slack; 1 ms is a laptop budget, not SwiftShader)', () => {
    const sim = makeSim({ level: woodsClearing, seed: 3, settings: { playerCount: 4 }, boxes: 16 });
    for (let i = 0; i < 30; i++) sim.step();
    const cam = createCamera(woodsClearing.bounds);
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      buildFrame(sim, cam, 0.5, 1920, 1080, []);
      samples.push(performance.now() - t0);
    }
    const mid = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 0;
    expect(Number.isFinite(mid)).toBe(true);
    expect(mid).toBeLessThan(50);
  });

  it('packs 500 groups without asserting GPU speed', () => {
    const groups = Array.from({ length: 500 }, (_, i) => ({
      minX: i * 0.1,
      minY: 0,
      maxX: i * 0.1 + 1,
      maxY: 1,
      color: '#f2c14e',
      blend: 'union' as const,
      smoothK: 0,
      layer: 1,
      primitives: [{ kind: PRIM_DISK, ax: i * 0.1, ay: 0.5, bx: 0, by: 0, r: 0.2 }],
    }));
    const t0 = performance.now();
    const packed = packGroups(groups);
    const ms = performance.now() - t0;
    expect(packed.groupCount).toBe(500);
    expect(packed.primCount).toBe(500);
    expect(Number.isFinite(ms)).toBe(true);
  });
});
