import { describe, expect, it } from 'vitest';
import { radialDeadzone } from '../src/input/gamepad';
import { rising } from '../src/sim/input';

describe('input', () => {
  it('detects rising edges', () => {
    expect(rising(false, true)).toBe(true);
    expect(rising(true, true)).toBe(false);
    expect(rising(true, false)).toBe(false);
  });

  it('applies radial deadzone', () => {
    expect(radialDeadzone(0.1, 0, 0.2)).toEqual({ x: 0, y: 0 });
    const v = radialDeadzone(1, 0, 0.2);
    expect(v.x).toBeCloseTo(1);
  });
});
