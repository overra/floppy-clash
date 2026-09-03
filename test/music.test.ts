import { describe, expect, it } from 'vitest';
import { musicPattern } from '../src/audio/mixer';

describe('procedural music', () => {
  it('emits a timed four-beat pattern', () => {
    const notes = musicPattern();
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.some((n) => n.at === 0)).toBe(true);
    expect(Math.max(...notes.map((n) => n.at))).toBeGreaterThanOrEqual(1);
    expect(notes.every((n) => n.freq > 0 && n.dur > 0)).toBe(true);
  });
});
