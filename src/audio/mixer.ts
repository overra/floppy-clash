import type { SimEvents } from '../sim/events';
import { WEAPON_BY_ID } from '../sim/weapons/defs';
import { playSfx, playTone, type SfxId } from './synth';

export type MusicNote = { at: number; freq: number; dur: number; type: OscillatorType; gain: number };

/** Four-beat procedural couch loop (PLAN M5 optional music). */
export function musicPattern(): MusicNote[] {
  return [
    { at: 0, freq: 110, dur: 0.18, type: 'sine', gain: 0.05 },
    { at: 0.25, freq: 220, dur: 0.06, type: 'square', gain: 0.02 },
    { at: 0.5, freq: 146.8, dur: 0.16, type: 'sine', gain: 0.045 },
    { at: 0.75, freq: 330, dur: 0.05, type: 'square', gain: 0.018 },
    { at: 1.0, freq: 98, dur: 0.2, type: 'triangle', gain: 0.04 },
    { at: 1.5, freq: 146.8, dur: 0.14, type: 'sine', gain: 0.04 },
  ];
}

export type Mixer = {
  sfx: number;
  music: number;
  muted: boolean;
  resume: () => void;
  handle: (events: SimEvents) => void;
  startMusic: () => void;
};

export function createMixer(): Mixer {
  let ctx: AudioContext | null = null;
  let sfxGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  const mixer: Mixer = {
    sfx: 0.8,
    music: 0.25,
    muted: false,
    resume() {
      if (!ctx) {
        ctx = new AudioContext();
        sfxGain = ctx.createGain();
        musicGain = ctx.createGain();
        sfxGain.connect(ctx.destination);
        musicGain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume();
      apply();
    },
    handle(events) {
      if (!ctx || !sfxGain || mixer.muted) return;
      for (const ev of events) {
        if (ev.type === 'shot') {
          const sound = WEAPON_BY_ID.get(ev.weaponId)?.def.sound;
          playSfx(ctx, sfxGain, (sound as SfxId | undefined) ?? 'shot.small');
        }
        if (ev.type === 'hit') playSfx(ctx, sfxGain, 'hit');
        if (ev.type === 'explosion') playSfx(ctx, sfxGain, 'explosion');
        if (ev.type === 'pickup') playSfx(ctx, sfxGain, 'pickup');
        if (ev.type === 'kill') playSfx(ctx, sfxGain, 'death');
      }
    },
    startMusic() {
      if (!ctx || !musicGain) return;
      const t0 = ctx.currentTime;
      for (const n of musicPattern()) {
        playTone(ctx, n.type, n.freq, n.dur, n.gain, musicGain, t0 + n.at);
      }
    },
  };
  function apply() {
    if (sfxGain) sfxGain.gain.value = mixer.muted ? 0 : mixer.sfx;
    if (musicGain) musicGain.gain.value = mixer.muted ? 0 : mixer.music;
  }
  return mixer;
}
