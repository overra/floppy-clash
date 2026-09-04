import type { WorldSnapshot } from '../sim/snapshot';

export type InterpSample = { at: number; snap: WorldSnapshot };

export function createInterpBuffer(delayMs = 120) {
  const samples: InterpSample[] = [];
  return {
    push(at: number, snap: WorldSnapshot) {
      samples.push({ at, snap });
      if (samples.length > 32) samples.shift();
    },
    sample(now: number): WorldSnapshot | null {
      const target = now - delayMs;
      let a = samples[0];
      let b = samples[0];
      for (const s of samples) {
        if (s.at <= target) a = s;
        if (s.at >= target) {
          b = s;
          break;
        }
        b = s;
      }
      return b?.snap ?? a?.snap ?? null;
    },
  };
}
