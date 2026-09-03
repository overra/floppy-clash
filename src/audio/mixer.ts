import type { SimEvents } from '../sim/events';
import { playSfx, playTone, type SfxId } from './synth';

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
        if (ev.type === 'shot') playSfx(ctx, sfxGain, ev.weaponId.startsWith('shot') ? (ev.weaponId as SfxId) : 'shot.small');
        if (ev.type === 'hit') playSfx(ctx, sfxGain, 'hit');
        if (ev.type === 'explosion') playSfx(ctx, sfxGain, 'explosion');
        if (ev.type === 'pickup') playSfx(ctx, sfxGain, 'pickup');
        if (ev.type === 'kill') playSfx(ctx, sfxGain, 'death');
      }
    },
    startMusic() {
      if (!ctx || !musicGain) return;
      playTone(ctx, 'sine', 110, 2.4, 0.04, musicGain);
    },
  };
  function apply() {
    if (sfxGain) sfxGain.gain.value = mixer.muted ? 0 : mixer.sfx;
    if (musicGain) musicGain.gain.value = mixer.muted ? 0 : mixer.music;
  }
  return mixer;
}
