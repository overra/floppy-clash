import { describe, expect, it } from 'vitest';
import { inspectWorld } from '../src/sim/inspect';
import { add, clamp, length, lerpAngle, normalize, vec2 } from '../src/core/math';
import { makeSim } from './helpers';
import { SeededRng } from '../src/core/rng';
import { fnv1a, hashToHex } from '../src/core/hash';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });
});

describe('vec math', () => {
  it('adds and normalizes', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
    const n = normalize(vec2(3, 4));
    expect(length(n)).toBeCloseTo(1);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it('lerpAngle takes the short way around ±π', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 5);
    expect(lerpAngle(-3, 3, 0.5)).toBeCloseTo(-Math.PI, 5);
    expect(lerpAngle(0.1, 0.5, 0.5)).toBeCloseTo(0.3, 5);
  });
});

describe('hash', () => {
  it('is stable', () => {
    expect(hashToHex(fnv1a('floppy'))).toBe(hashToHex(fnv1a('floppy')));
  });
});

describe('entity inspector', () => {
  it('lists net ids and trait names', () => {
    const sim = makeSim({ settings: { playerCount: 2 } });
    const rows = inspectWorld(sim.ecs, 16);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.traits.includes('Player'))).toBe(true);
    expect(rows.every((r) => r.traits.includes('NetId') || r.netId >= 0)).toBe(true);
  });
});
