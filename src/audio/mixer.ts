import type { SimEvent, SimEvents } from '../sim/events';
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

/** PLAN M5: every combat event maps to a synth id (no silent throw/block/jump). */
export function sfxForEvent(ev: SimEvent): SfxId | undefined {
  if (ev.type === 'shot') {
    return (WEAPON_BY_ID.get(ev.weaponId)?.def.sound as SfxId | undefined) ?? 'shot.small';
  }
  if (ev.type === 'hit') return 'hit';
  if (ev.type === 'explosion') return 'explosion';
  if (ev.type === 'pickup') return 'pickup';
  if (ev.type === 'kill') return 'death';
  if (ev.type === 'throw') return 'shot.heavy';
  if (ev.type === 'block') return ev.reflected ? 'shot.laser' : 'punch';
  if (ev.type === 'jump') return 'jump';
  return undefined;
}

export type Mixer = {
  sfx: number;
  music: number;
  muted: boolean;
  resume: () => void;
  handle: (events: SimEvents) => void;
  startMusic: () => void;
  stopMusic: () => void;
  applyGains: () => void;
};

export function createMixer(): Mixer {
  let ctx: AudioContext | null = null;
  let sfxGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let musicTimer = 0;
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
        const id = sfxForEvent(ev);
        if (id) playSfx(ctx, sfxGain, id);
      }
    },
    startMusic() {
      if (!ctx || !musicGain) return;
      mixer.stopMusic();
      let nextAt = ctx.currentTime;
      const loop = 2;
      const schedule = () => {
        if (!ctx || !musicGain) return;
        while (nextAt < ctx.currentTime + 4) {
          for (const n of musicPattern()) {
            playTone(ctx, n.type, n.freq, n.dur, n.gain, musicGain, nextAt + n.at);
          }
          nextAt += loop;
        }
      };
      schedule();
      if (typeof window !== 'undefined') musicTimer = window.setInterval(schedule, 1500);
    },
    stopMusic() {
      if (musicTimer && typeof window !== 'undefined') window.clearInterval(musicTimer);
      musicTimer = 0;
    },
    applyGains() {
      apply();
    },
  };
  function apply() {
    if (sfxGain) sfxGain.gain.value = mixer.muted ? 0 : mixer.sfx;
    if (musicGain) musicGain.gain.value = mixer.muted ? 0 : mixer.music;
  }
  return mixer;
}
