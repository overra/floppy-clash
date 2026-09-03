import { describe, expect, it } from 'vitest';
import { musicPattern, sfxForEvent } from '../src/audio/mixer';

describe('procedural music', () => {
  it('emits a timed four-beat pattern', () => {
    const notes = musicPattern();
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.some((n) => n.at === 0)).toBe(true);
    expect(Math.max(...notes.map((n) => n.at))).toBeGreaterThanOrEqual(1);
    expect(notes.every((n) => n.freq > 0 && n.dur > 0)).toBe(true);
  });

  it('routes punch / throw / block / jump to synth ids', () => {
    expect(sfxForEvent({ type: 'shot', source: 0, weaponId: 'fists', x: 0, y: 0, aimX: 1, aimY: 0 })).toBe(
      'punch',
    );
    expect(sfxForEvent({ type: 'throw', player: 0, weaponId: 'pistol' })).toBe('shot.heavy');
    expect(sfxForEvent({ type: 'block', player: 0, reflected: false })).toBe('punch');
    expect(sfxForEvent({ type: 'block', player: 0, reflected: true })).toBe('shot.laser');
    expect(sfxForEvent({ type: 'jump', player: 0 })).toBe('jump');
    expect(sfxForEvent({ type: 'pickup', player: 0, weaponId: 'pistol' })).toBe('pickup');
    expect(sfxForEvent({ type: 'score', slot: 0, wins: 1 })).toBeUndefined();
  });
});
