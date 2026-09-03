export type SfxId =
  | 'punch'
  | 'shot.small'
  | 'shot.heavy'
  | 'shot.rifle'
  | 'shot.shotgun'
  | 'shot.sniper'
  | 'shot.rocket'
  | 'shot.launcher'
  | 'shot.snake'
  | 'shot.lava'
  | 'shot.beam'
  | 'shot.stream'
  | 'shot.laser'
  | 'shot.ice'
  | 'shot.glue'
  | 'shot.minigun'
  | 'shot.flame'
  | 'shot.bounce'
  | 'shot.god'
  | 'melee.sword'
  | 'melee.spear'
  | 'melee.blink'
  | 'field.bubble'
  | 'field.hole'
  | 'hit'
  | 'explosion'
  | 'pickup'
  | 'jump'
  | 'death';

export function playTone(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  dur: number,
  gain: number,
  dest: AudioNode,
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

export function playNoise(ctx: AudioContext, dur: number, gain: number, dest: AudioNode): void {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(g);
  g.connect(dest);
  src.start();
}

export function playSfx(ctx: AudioContext, dest: AudioNode, id: SfxId): void {
  switch (id) {
    case 'punch':
      playTone(ctx, 'square', 90, 0.08, 0.12, dest);
      break;
    case 'shot.small':
    case 'shot.rifle':
    case 'shot.laser':
      playTone(ctx, 'square', 420, 0.05, 0.08, dest);
      playNoise(ctx, 0.04, 0.05, dest);
      break;
    case 'shot.heavy':
    case 'shot.sniper':
    case 'shot.god':
      playTone(ctx, 'sawtooth', 180, 0.12, 0.14, dest);
      playNoise(ctx, 0.08, 0.08, dest);
      break;
    case 'shot.shotgun':
    case 'explosion':
      playNoise(ctx, 0.25, 0.2, dest);
      playTone(ctx, 'triangle', 70, 0.2, 0.16, dest);
      break;
    case 'shot.rocket':
    case 'shot.launcher':
      playTone(ctx, 'sawtooth', 110, 0.18, 0.12, dest);
      break;
    case 'pickup':
      playTone(ctx, 'sine', 520, 0.1, 0.08, dest);
      break;
    case 'hit':
    case 'death':
      playNoise(ctx, 0.12, 0.1, dest);
      break;
    default:
      playTone(ctx, 'square', 240, 0.06, 0.07, dest);
  }
}
