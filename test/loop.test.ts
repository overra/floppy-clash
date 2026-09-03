import { describe, expect, it } from 'vitest';
import { MAX_CATCHUP_STEPS, createFixedStepLoop, interpolationAlpha } from '../src/core/loop';

describe('fixed-step loop', () => {
  it('runs one 60 Hz tick every other 120 Hz frame and keeps the remainder for interpolation', () => {
    const loop = createFixedStepLoop(60);
    expect(loop.consume(1 / 120)).toBe(0);
    expect(interpolationAlpha(loop)).toBeCloseTo(0.5);
    expect(loop.consume(1 / 120)).toBe(1);
    expect(interpolationAlpha(loop)).toBeCloseTo(0, 5);
  });

  it('scales sim time for slow-mo', () => {
    const loop = createFixedStepLoop(60);
    expect(loop.consume(1 / 60, 0.3)).toBe(0);
    expect(loop.consume(1 / 60, 0.3)).toBe(0);
    expect(loop.consume(1 / 60, 0.3)).toBe(0);
    expect(loop.consume(1 / 60, 0.3)).toBe(1);
  });

  it('caps catch-up after a stall and drops the rest of the debt instead of spiralling', () => {
    const loop = createFixedStepLoop(60);
    // A 100 ms hitch owes six ticks; only MAX_CATCHUP_STEPS run and the debt is forgiven.
    expect(loop.consume(0.1)).toBe(MAX_CATCHUP_STEPS);
    expect(loop.accumulator).toBeLessThan(loop.tickDt);
    // The next normal frame is back to the steady cadence, not another burst.
    expect(loop.consume(1 / 120)).toBeLessThanOrEqual(1);
    expect(loop.consume(1 / 120)).toBeLessThanOrEqual(1);
  });
});
