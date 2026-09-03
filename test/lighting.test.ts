import { describe, expect, it } from 'vitest';
import { createRadianceCascades, getCascadeDim } from '@typegpu/radiance-cascades';
import { createJumpFlood } from '@typegpu/sdf';
import { emptyFrame } from '../src/render/frame';
import {
  emitterContribution,
  jumpFloodSdf,
  lightingEnabled,
  occludedEmitterContribution,
  sampleJumpFlood,
  solidRectsFromFrame,
} from '../src/render/gpu/lighting';

describe('2D lighting', () => {
  it('respects the GPU budget toggle', () => {
    expect(lightingEnabled({ enabled: true, budgetMs: 4 }, 2)).toBe(true);
    expect(lightingEnabled({ enabled: true, budgetMs: 4 }, 4)).toBe(false);
    expect(lightingEnabled({ enabled: false, budgetMs: 4 }, 1)).toBe(false);
  });

  it('accumulates emitter falloff on the CPU', () => {
    const c = emitterContribution(
      [{ x: 0, y: 0, radius: 2, r: 1, g: 0.5, b: 0.1, intensity: 1 }],
      0,
      0,
    );
    expect(c.r).toBeGreaterThan(0.5);
    const far = emitterContribution(
      [{ x: 0, y: 0, radius: 2, r: 1, g: 0.5, b: 0.1, intensity: 1 }],
      8,
      0,
    );
    expect(far.r).toBe(0);
  });

  it('exposes radiance-cascades and jump-flood factories', () => {
    expect(typeof createRadianceCascades).toBe('function');
    expect(typeof createJumpFlood).toBe('function');
    const dim = getCascadeDim(256, 144);
    expect(dim.length).toBeGreaterThanOrEqual(2);
  });

  it('Jump Flood of solids occludes lava/muzzle/explosion emitters (PLAN 4.11)', () => {
    const bounds = { x: 0, y: 0, w: 16, h: 8 };
    const wall = { minX: 7.2, minY: 0, maxX: 8.8, maxY: 8 };
    const field = jumpFloodSdf([wall], bounds, 64, 32);
    expect(sampleJumpFlood(field, 8, 4)).toBeLessThan(0);
    expect(sampleJumpFlood(field, 2, 4)).toBeGreaterThan(0.5);
    const lava = [{ x: 2, y: 4, radius: 12, r: 1, g: 0.4, b: 0.1, intensity: 1 }];
    const lit = occludedEmitterContribution(field, lava, 3, 4);
    const shadow = occludedEmitterContribution(field, lava, 13, 4);
    expect(lit.r).toBeGreaterThan(0.2);
    expect(shadow.r).toBeLessThan(lit.r * 0.15);
    const frame = emptyFrame();
    frame.groups.push({
      minX: 1,
      minY: 1,
      maxX: 3,
      maxY: 2,
      color: '#333',
      blend: 'union',
      smoothK: 0,
      layer: 1,
      primitives: [],
    });
    frame.groups.push({
      minX: 4,
      minY: 4,
      maxX: 5,
      maxY: 5,
      color: '#f80',
      blend: 'union',
      smoothK: 0,
      layer: 2,
      primitives: [],
    });
    expect(solidRectsFromFrame(frame)).toEqual([{ minX: 1, minY: 1, maxX: 3, maxY: 2 }]);
  });
});
