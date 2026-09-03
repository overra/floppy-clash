/**
 * Frame profiler: wall time per stage of the frame over a sliding window, so the F3 overlay and
 * `window.__floppy.perf()` can say where a slow frame went. Cheap enough to leave on: one
 * `performance.now()` per stage and a ring buffer per stage, no allocation per frame.
 */
export type StageStats = { med: number; p95: number; p99: number; max: number; mean: number };

export type Profiler = {
  /** Start a frame; returns the timestamp to pass to `lap`. */
  begin(): number;
  /** Record `stage` as the time since `since`; returns the new timestamp. */
  lap(stage: string, since: number): number;
  /** Record an arbitrary sample (e.g. a count, or a time measured elsewhere). */
  sample(stage: string, value: number): void;
  /** Close the frame: records `frame` as begin → now. */
  end(): void;
  /** Percentiles over the window, per stage, in insertion order. */
  stats(): Record<string, StageStats>;
  /** The previous (most recently closed) frame's samples, per stage. */
  last(): Record<string, number>;
  /** Number of frames recorded so far (saturates at the window size). */
  readonly frames: number;
};

export function createProfiler(window = 240): Profiler {
  const rings = new Map<string, Float64Array>();
  let head = 0;
  let filled = 0;
  let frameStart = 0;
  const ring = (stage: string): Float64Array => {
    let r = rings.get(stage);
    if (!r) {
      r = new Float64Array(window);
      rings.set(stage, r);
    }
    return r;
  };
  return {
    get frames() {
      return filled;
    },
    begin() {
      // Stages not sampled this frame must read as 0, not as whatever the slot held `window` frames ago.
      for (const r of rings.values()) r[head] = 0;
      frameStart = performance.now();
      return frameStart;
    },
    lap(stage, since) {
      const now = performance.now();
      ring(stage)[head] = now - since;
      return now;
    },
    sample(stage, value) {
      ring(stage)[head] = value;
    },
    end() {
      ring('frame')[head] = performance.now() - frameStart;
      head = (head + 1) % window;
      filled = Math.min(window, filled + 1);
    },
    last() {
      const out: Record<string, number> = {};
      if (!filled) return out;
      const i = (head + window - 1) % window;
      for (const [stage, r] of rings) out[stage] = r[i]!;
      return out;
    },
    stats() {
      const out: Record<string, StageStats> = {};
      for (const [stage, r] of rings) {
        const s = Array.from(r.subarray(0, filled)).sort((a, b) => a - b);
        if (!s.length) continue;
        const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
        let sum = 0;
        for (const v of s) sum += v;
        out[stage] = { med: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1]!, mean: sum / s.length };
      }
      return out;
    },
  };
}

/** One-line summary for overlays/logs: `sim 0.41/1.2  build 0.35/0.9 ...` (median/p99, ms). */
export function formatStats(stats: Record<string, StageStats>, digits = 2): string {
  return Object.entries(stats)
    .map(([k, v]) => `${k} ${v.med.toFixed(digits)}/${v.p99.toFixed(digits)}`)
    .join('  ');
}
