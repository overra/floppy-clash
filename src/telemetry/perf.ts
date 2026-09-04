/**
 * Frame-pacing aggregator for telemetry. The F3 profiler (src/core/perf.ts) keeps a 240-frame
 * window for the overlay; this one summarises a whole slice of play — a minute, or a match — into
 * a handful of numbers cheap enough to ship: rAF-interval percentiles from a fixed histogram, long
 * frame counts, and mean per-stage cost. One histogram increment per frame, no allocation.
 */

export type PerfSummary = {
  frames: number;
  /** Wall time covered by the counted frames. */
  seconds: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Frames whose interval exceeded 12 / 20 / 50 ms. */
  long12: number;
  long20: number;
  long50: number;
  /** Mean of each stage over the frames sampled with `stages()`. */
  stages: Record<string, number>;
};

export type PerfAggregator = {
  /** Count one rendered frame; `intervalMs` is the gap since the previous rAF callback. */
  frame(intervalMs: number): void;
  /** Fold in one frame's stage timings (call every few frames; means are per sampled frame). */
  stages(last: Record<string, number>): void;
  /** Summary of everything since the last reset, or null when nothing was counted. */
  summary(): PerfSummary | null;
  reset(): void;
  readonly frames: number;
};

// 0–50 ms in 0.25 ms steps (where every frame at 60–144 Hz lives), 50–250 ms in 2 ms steps, then
// one overflow bucket. Percentiles report the upper edge of their bucket.
const FINE_STEP = 0.25;
const FINE_BUCKETS = 200;
const COARSE_STEP = 2;
const COARSE_BUCKETS = 100;
const FINE_LIMIT = FINE_STEP * FINE_BUCKETS;
const TOTAL_BUCKETS = FINE_BUCKETS + COARSE_BUCKETS + 1;

function bucketOf(ms: number): number {
  if (ms < FINE_LIMIT) return Math.max(0, Math.floor(ms / FINE_STEP));
  const coarse = Math.floor((ms - FINE_LIMIT) / COARSE_STEP);
  return coarse < COARSE_BUCKETS ? FINE_BUCKETS + coarse : TOTAL_BUCKETS - 1;
}

function upperEdge(bucket: number): number {
  if (bucket < FINE_BUCKETS) return (bucket + 1) * FINE_STEP;
  if (bucket < FINE_BUCKETS + COARSE_BUCKETS) return FINE_LIMIT + (bucket - FINE_BUCKETS + 1) * COARSE_STEP;
  return FINE_LIMIT + COARSE_BUCKETS * COARSE_STEP;
}

export function createPerfAggregator(): PerfAggregator {
  const hist = new Uint32Array(TOTAL_BUCKETS);
  let frames = 0;
  let totalMs = 0;
  let max = 0;
  let long12 = 0;
  let long20 = 0;
  let long50 = 0;
  const sums = new Map<string, number>();
  let stageSamples = 0;

  const percentile = (p: number): number => {
    const target = Math.max(1, Math.ceil(frames * p));
    let seen = 0;
    for (let i = 0; i < TOTAL_BUCKETS; i++) {
      seen += hist[i]!;
      if (seen >= target) return upperEdge(i);
    }
    return upperEdge(TOTAL_BUCKETS - 1);
  };

  return {
    get frames() {
      return frames;
    },
    frame(intervalMs) {
      if (!(intervalMs >= 0) || !Number.isFinite(intervalMs)) return;
      frames += 1;
      totalMs += intervalMs;
      hist[bucketOf(intervalMs)]! += 1;
      if (intervalMs > max) max = intervalMs;
      if (intervalMs > 12) long12 += 1;
      if (intervalMs > 20) long20 += 1;
      if (intervalMs > 50) long50 += 1;
    },
    stages(last) {
      stageSamples += 1;
      for (const key in last) {
        const v = last[key];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        sums.set(key, (sums.get(key) ?? 0) + v);
      }
    },
    summary() {
      if (frames === 0) return null;
      const stages: Record<string, number> = {};
      if (stageSamples > 0) for (const [k, v] of sums) stages[k] = round(v / stageSamples);
      return {
        frames,
        seconds: round(totalMs / 1000),
        p50: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99),
        max: round(max),
        long12,
        long20,
        long50,
        stages,
      };
    },
    reset() {
      hist.fill(0);
      frames = 0;
      totalMs = 0;
      max = 0;
      long12 = long20 = long50 = 0;
      sums.clear();
      stageSamples = 0;
    },
  };
}

/** Two decimals is plenty for milliseconds and keeps the JSON short. */
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
