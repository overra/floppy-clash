import { describe, expect, it } from 'vitest';
import { createRadianceCascades, getCascadeDim } from '@typegpu/radiance-cascades';
import { createJumpFlood } from '@typegpu/sdf';
import { emitterContribution, lightingEnabled } from '../src/render/gpu/lighting';

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
});
