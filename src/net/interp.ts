import type { WorldSnapshot } from '../sim/snapshot';

export type InterpSample = { at: number; snap: WorldSnapshot };

export function createInterpBuffer(delayMs = 120) {
  const samples: InterpSample[] = [];
  return {
    push(at: number, snap: WorldSnapshot) {
      samples.push({ at, snap });
      if (samples.length > 32) samples.shift();
    },
    reset() {
      samples.length = 0;
    },
    sample(now: number): WorldSnapshot | null {
      return this.samplePair(now)?.to ?? samples[0]?.snap ?? null;
    },
    samplePair(now: number): { from: WorldSnapshot; to: WorldSnapshot; alpha: number } | null {
      if (!samples.length) return null;
      const target = now - delayMs;
      let from = samples[0]!;
      let to = samples[samples.length - 1]!;
      for (const s of samples) {
        if (s.at <= target) from = s;
        if (s.at >= target) {
          to = s;
          break;
        }
        to = s;
      }
      const span = to.at - from.at;
      const alpha = span <= 0 ? 1 : Math.min(1, Math.max(0, (target - from.at) / span));
      return { from: from.snap, to: to.snap, alpha };
    },
  };
}
