import { describe, expect, it } from 'vitest';
import {
  GPU_BUDGET_MS,
  GPU_RELAX_MS,
  MIN_RESOLUTION_SCALE,
  RESOLUTION_STEP,
  nextResolutionScale,
} from '../src/render/gpu/renderer';

// Pass time is ~linear in pixel count, and pixel count is scale²: this is how a step changes the
// measured time.
const afterStepDown = (ms: number) => ms * RESOLUTION_STEP * RESOLUTION_STEP;
const afterStepUp = (ms: number) => ms / (RESOLUTION_STEP * RESOLUTION_STEP);

describe('dynamic render resolution', () => {
  it('holds full resolution while the GPU pass is inside its budget', () => {
    expect(nextResolutionScale(1, 1.5)).toBe(1);
    expect(nextResolutionScale(1, GPU_BUDGET_MS)).toBe(1);
    expect(nextResolutionScale(1, 0)).toBe(1);
  });

  it('steps down when the pass overruns and never below the floor', () => {
    let s = 1;
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      s = nextResolutionScale(s, 9);
      seen.push(s);
    }
    expect(seen[0]).toBeCloseTo(RESOLUTION_STEP);
    expect(Math.min(...seen)).toBe(MIN_RESOLUTION_SCALE);
    expect(nextResolutionScale(MIN_RESOLUTION_SCALE, 50)).toBe(MIN_RESOLUTION_SCALE);
  });

  it('steps back up only once the pass has real headroom, capped at 1', () => {
    expect(nextResolutionScale(0.85, 3.5)).toBe(0.85); // between the lines: hold
    expect(nextResolutionScale(0.85, 2.0)).toBe(1);
    expect(nextResolutionScale(0.5, 1.0)).toBeCloseTo(0.5 / RESOLUTION_STEP);
    expect(nextResolutionScale(1, 0.5)).toBe(1);
  });

  it('ignores a few contended frames: only a sustained (median) overrun steps down', () => {
    // Median comfortably inside budget, p90 blown out by another app's GPU work: hold.
    expect(nextResolutionScale(1, 1.6, 7.0)).toBe(1);
    // And with the p90 also high after a step down, do not bounce back up either.
    expect(nextResolutionScale(0.85, 1.6, 3.0)).toBe(0.85);
    expect(nextResolutionScale(0.85, 1.6, 2.0)).toBe(1);
  });

  it('cannot oscillate: a step in either direction lands inside the hold band', () => {
    // Just over budget → step down → the new pass time must not already ask for a step up.
    const justOver = GPU_BUDGET_MS + 0.01;
    expect(nextResolutionScale(1, justOver)).toBeLessThan(1);
    expect(afterStepDown(justOver)).toBeGreaterThan(GPU_RELAX_MS);
    // Just under relax → step up → the new pass time must not already ask for a step down.
    const justUnder = GPU_RELAX_MS - 0.01;
    expect(nextResolutionScale(0.85, justUnder)).toBeGreaterThan(0.85);
    expect(afterStepUp(justUnder)).toBeLessThan(GPU_BUDGET_MS);
  });

  it('converges from a badly overrunning start instead of thrashing', () => {
    // A GPU that needs 7 ms at full resolution.
    const fullMs = 7;
    let s = 1;
    const trail: number[] = [];
    for (let i = 0; i < 12; i++) {
      const ms = fullMs * s * s;
      s = nextResolutionScale(s, ms);
      trail.push(s);
    }
    const settled = trail.at(-1)!;
    expect(fullMs * settled * settled).toBeLessThanOrEqual(GPU_BUDGET_MS);
    // Once settled it stays put.
    expect(trail.slice(-4).every((v) => v === settled)).toBe(true);
  });
});
