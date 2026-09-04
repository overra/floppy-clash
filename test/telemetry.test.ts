import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry, type Transport } from '../src/telemetry/client';
import { classifyUserAgent } from '../src/telemetry/device';
import { createPerfAggregator } from '../src/telemetry/perf';
import { DATASETS, relayPoint, toDataPoints } from '../src/telemetry/points';
import { MAX_EVENTS_PER_BATCH, telemetryBatchSchema, type MatchEvent, type TelemetryBatch } from '../src/telemetry/schema';
import { DEFAULT_USER_SETTINGS, loadSettings } from '../src/ui/settingsStore';

const ctx = { device: 'desktop', os: 'macos', browser: 'chrome' } as const;

const matchStart: MatchEvent = {
  k: 'match',
  phase: 'start',
  mode: 'solo',
  role: 'offline',
  level: 'woods-clearing',
  renderer: 'gpu',
  humans: 1,
  bots: 2,
  firstTo: 3,
  maxHp: 100,
  seconds: 0,
  rounds: 0,
  kills: 0,
  won: false,
  longFrames: 0,
};

function batch(events: TelemetryBatch['events']): TelemetryBatch {
  return { v: 1, sid: 'abcdef0123456789', ctx, events };
}

describe('perf aggregator', () => {
  it('reports percentiles from the histogram, long-frame counts and stage means', () => {
    const agg = createPerfAggregator();
    // 90 smooth frames, 8 that missed 60 Hz, two real hitches.
    for (let i = 0; i < 90; i++) agg.frame(16.6);
    for (let i = 0; i < 8; i++) agg.frame(25);
    agg.frame(120);
    agg.frame(120);
    agg.stages({ sim: 2, render: 4 });
    agg.stages({ sim: 4, render: 6, gpu: 1 });
    const s = agg.summary()!;
    expect(s.frames).toBe(100);
    expect(s.p50).toBeCloseTo(16.75, 5); // upper edge of the 0.25 ms bucket holding 16.6
    expect(s.p95).toBeCloseTo(25.25, 5);
    expect(s.p99).toBe(122); // 2 ms buckets above 50 ms
    expect(s.max).toBe(120);
    expect(s.long12).toBe(100);
    expect(s.long20).toBe(10);
    expect(s.long50).toBe(2);
    expect(s.seconds).toBeCloseTo((90 * 16.6 + 8 * 25 + 240) / 1000, 2);
    expect(s.stages).toEqual({ sim: 3, render: 5, gpu: 0.5 });
  });

  it('ignores garbage intervals, clamps the overflow bucket and resets cleanly', () => {
    const agg = createPerfAggregator();
    agg.frame(NaN);
    agg.frame(-5);
    agg.frame(Infinity);
    expect(agg.summary()).toBeNull();
    agg.frame(5000);
    expect(agg.summary()!.p50).toBe(250);
    expect(agg.summary()!.max).toBe(5000);
    agg.reset();
    expect(agg.frames).toBe(0);
    expect(agg.summary()).toBeNull();
  });
});

describe('device classification', () => {
  const cases: [string, ReturnType<typeof classifyUserAgent>, Parameters<typeof classifyUserAgent>[1]?][] = [
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      { device: 'desktop', os: 'macos', browser: 'chrome' },
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
      { device: 'desktop', os: 'windows', browser: 'edge' },
    ],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', { device: 'mobile', os: 'ios', browser: 'safari' }],
    // iPadOS Safari pretends to be a Mac; the touch points give it away.
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      { device: 'tablet', os: 'ios', browser: 'safari' },
      { touchPoints: 5 },
    ],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', { device: 'mobile', os: 'android', browser: 'chrome' }],
    ['Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', { device: 'tablet', os: 'android', browser: 'chrome' }],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', { device: 'desktop', os: 'linux', browser: 'firefox' }],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', { device: 'desktop', os: 'chromeos', browser: 'chrome' }],
    // Client hints beat the UA string when present.
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36', { device: 'mobile', os: 'android', browser: 'brave' }, { mobile: true, platform: 'Android', brands: ['Brave', 'Chromium'] }],
    ['', { device: 'desktop', os: 'other', browser: 'other' }],
  ];
  for (const [ua, expected, hints] of cases) {
    it(`classifies ${ua.slice(0, 40) || 'an empty UA'}…`, () => {
      expect(classifyUserAgent(ua, hints)).toEqual(expected);
    });
  }

  it('only ever produces values the wire schema accepts', () => {
    const uas = ['Mozilla/5.0 (PlayStation; PlayStation 5/8.20) AppleWebKit/605.1.15', 'curl/8.4.0', 'Mozilla/5.0 (Nintendo Switch; WifiWebAuthApplet) AppleWebKit/609.4'];
    for (const ua of uas) {
      expect(telemetryBatchSchema.safeParse(batch([matchStart])).success).toBe(true);
      const info = classifyUserAgent(ua);
      expect(telemetryBatchSchema.shape.ctx.safeParse(info).success).toBe(true);
    }
  });
});

describe('wire schema', () => {
  it('accepts a well-formed batch and rejects the things a hostile client would try', () => {
    expect(telemetryBatchSchema.safeParse(batch([matchStart])).success).toBe(true);
    const bad = [
      { ...batch([matchStart]), sid: 'not a session id!' },
      { ...batch([matchStart]), v: 2 },
      batch([]),
      batch(Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => matchStart)),
      batch([{ ...matchStart, level: 'Bobby Tables; DROP' }]),
      batch([{ ...matchStart, mode: 'ranked' as never }]),
      batch([{ ...matchStart, humans: 40 }]),
      batch([{ ...matchStart, seconds: -1 }]),
      batch([{ ...matchStart, seconds: Infinity }]),
      batch([{ k: 'error', kind: 'js', message: 'x'.repeat(301), source: '', context: 'menu', renderer: 'canvas' }]),
      { ...batch([matchStart]), ctx: { device: 'desktop', os: 'macos', browser: 'Chrome 128 (Blink)' } },
    ];
    for (const b of bad) expect(telemetryBatchSchema.safeParse(b).success, JSON.stringify(b).slice(0, 80)).toBe(false);
  });
});

describe('Analytics Engine points', () => {
  it('maps each event kind to its dataset with env and country first, session id as the index', () => {
    const b = batch([
      { k: 'page', renderer: 'auto', entry: 'invite', standalone: true, width: 1512, height: 982, dpr: 2, cores: 10, memory: 8, touch: false, gamepads: 1 },
      matchStart,
      { ...matchStart, phase: 'end', outcome: 'finished', seconds: 95, rounds: 4, kills: 7, won: true, longFrames: 3 },
      {
        k: 'perf',
        mode: 'online',
        role: 'client',
        renderer: 'canvas',
        reason: 'periodic',
        lighting: true,
        frames: 3600,
        seconds: 60,
        p50: 16.75,
        p95: 18,
        p99: 34,
        max: 120,
        long12: 40,
        long20: 12,
        long50: 1,
        sim: 1.5,
        build: 0.4,
        render: 3.2,
        gpu: 0,
        particles: 140,
        resScale: 1,
        players: 3,
        rtt: 42,
        desyncs: 1,
        heap: 90,
      },
      { k: 'error', kind: 'gpu-fallback', message: 'requestAdapter returned null', source: 'auto', context: 'menu', renderer: 'canvas' },
    ]);
    const points = toDataPoints(b, { environment: 'production', country: 'DE' });
    expect(points.map((p) => p.dataset)).toEqual(['sessions', 'matches', 'matches', 'perf', 'errors']);
    for (const { point } of points) {
      expect(point.blobs.slice(0, 2)).toEqual(['production', 'DE']);
      expect(point.indexes).toEqual(['abcdef0123456789']);
      expect(point.blobs.length).toBeLessThanOrEqual(20);
      expect(point.doubles.length).toBeLessThanOrEqual(20);
    }
    const [page, start, end, perf, error] = points.map((p) => p.point);
    expect(page!.blobs).toEqual(['production', 'DE', 'desktop', 'macos', 'chrome', 'auto', 'invite', '1']);
    expect(page!.doubles).toEqual([1, 1512, 982, 2, 10, 8, 0, 1]);
    expect(start!.blobs).toEqual(['production', 'DE', 'start', 'solo', 'offline', 'woods-clearing', 'gpu', '', 'desktop', 'macos', 'chrome']);
    expect(end!.blobs[7]).toBe('finished');
    expect(end!.doubles).toEqual([1, 1, 2, 3, 100, 95, 4, 7, 1, 3]);
    expect(perf!.blobs).toEqual(['production', 'DE', 'online', 'client', 'canvas', 'periodic', 'desktop', 'macos', 'chrome', '1']);
    expect(perf!.doubles).toEqual([3600, 60, 16.75, 18, 34, 120, 40, 12, 1, 1.5, 0.4, 3.2, 0, 140, 1, 3, 42, 1, 90]);
    expect(error!.blobs).toEqual(['production', 'DE', 'gpu-fallback', 'requestAdapter returned null', 'auto', 'menu', 'canvas', 'desktop', 'macos', 'chrome']);
    expect(error!.doubles).toEqual([1]);
    expect(Object.values(DATASETS)).toHaveLength(5);
  });

  it('shapes relay rows the same way', () => {
    const p = relayPoint({ environment: 'production', country: 'US', event: 'leave', role: 'client', reason: '1006', colo: 'SJC', peers: 2, seconds: 310, roomInstance: 'a1b2c3d4' });
    expect(p).toEqual({ blobs: ['production', 'US', 'leave', 'client', '1006', 'SJC'], doubles: [1, 2, 310], indexes: ['a1b2c3d4'] });
  });
});

describe('telemetry client', () => {
  let sent: { endpoint: string; body: TelemetryBatch }[];
  const transport: Transport = (endpoint, body) => {
    sent.push({ endpoint, body: JSON.parse(body) as TelemetryBatch });
  };
  beforeEach(() => {
    sent = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches events by size and by time, and every batch validates', () => {
    const t = createTelemetry({ enabled: true, ctx, transport, listen: false, batchSize: 3, flushAfterMs: 1000 });
    t.match(matchStart);
    t.match(matchStart);
    expect(sent).toHaveLength(0);
    t.match(matchStart);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.endpoint).toBe('/api/telemetry');
    expect(sent[0]!.body.events).toHaveLength(3);
    expect(sent[0]!.body.sid).toBe(t.sessionId);
    expect(telemetryBatchSchema.safeParse(sent[0]!.body).success).toBe(true);

    t.error({ kind: 'desync', message: 'hash', source: 'tick 400', context: 'online', renderer: 'gpu' });
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.body.events[0]).toMatchObject({ k: 'error', kind: 'desync' });
  });

  it('splits a burst into batches the Worker will accept', () => {
    const t = createTelemetry({ enabled: true, ctx, transport, listen: false, batchSize: 50, flushAfterMs: 1000 });
    for (let i = 0; i < 120; i++) t.match(matchStart);
    t.flush();
    expect(sent.map((s) => s.body.events.length)).toEqual([50, 50, 20]);
    for (const s of sent) expect(telemetryBatchSchema.safeParse(s.body).success).toBe(true);
  });

  it('is silent when disabled, and turning it off drops what was queued', () => {
    const off = createTelemetry({ enabled: false, ctx, transport, listen: false });
    off.page({ renderer: 'auto', entry: 'direct', standalone: false, width: 1, height: 1, dpr: 1, cores: 1, memory: 0, touch: false, gamepads: 0 });
    off.flush();
    expect(sent).toHaveLength(0);
    expect(off.enabled).toBe(false);

    const on = createTelemetry({ enabled: true, ctx, transport, listen: false, batchSize: 10 });
    on.match(matchStart);
    expect(on.pending).toBe(1);
    on.setEnabled(false);
    on.match(matchStart);
    on.flush();
    expect(sent).toHaveLength(0);
    on.setEnabled(true);
    on.match(matchStart);
    on.flush();
    expect(sent).toHaveLength(1);
  });

  it('clips long messages and swallows transport failures', () => {
    const t = createTelemetry({
      enabled: true,
      ctx,
      listen: false,
      transport: () => {
        throw new Error('network down');
      },
    });
    t.error({ kind: 'js', message: 'x'.repeat(1000), source: 'y'.repeat(1000), context: 'menu', renderer: 'canvas' });
    expect(() => t.flush()).not.toThrow();
    const clipped = createTelemetry({ enabled: true, ctx, transport, listen: false });
    clipped.error({ kind: 'js', message: 'x'.repeat(1000), source: 'y'.repeat(1000), context: 'menu', renderer: 'canvas' });
    clipped.flush();
    expect(telemetryBatchSchema.safeParse(sent[0]!.body).success).toBe(true);
  });

  it('generates a session id the schema accepts', () => {
    const t = createTelemetry({ enabled: true, ctx, transport, listen: false });
    expect(t.sessionId).toMatch(/^[a-z0-9]{8,32}$/);
  });
});

describe('telemetry setting', () => {
  it('defaults on and survives an older saved settings object', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
      configurable: true,
    });
    expect(DEFAULT_USER_SETTINGS.telemetry).toBe(true);
    const { telemetry: _omit, ...legacy } = DEFAULT_USER_SETTINGS;
    store.set('floppy-clash.settings', JSON.stringify(legacy));
    expect(loadSettings().telemetry).toBe(true);
    store.set('floppy-clash.settings', JSON.stringify({ ...legacy, telemetry: false }));
    expect(loadSettings().telemetry).toBe(false);
  });
});
