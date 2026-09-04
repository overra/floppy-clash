import { DATASETS } from '../src/telemetry/points';
import {
  isStatsRange,
  type ErrorRow,
  type PerfGroupRow,
  type PerfTimelinePoint,
  type RelayRow,
  type StatsRange,
  type StatsResponse,
  type TimelinePoint,
} from '../src/telemetry/stats';
import { jsonError, secretsMatch } from './http';

/**
 * `GET /api/stats?range=24h`: the numbers behind the /stats dashboard. Analytics Engine can only be
 * read through Cloudflare's SQL API, which needs an account-level token, so the Worker holds that
 * token (a secret) and does the querying; the dashboard only ever sees this endpoint, gated by a
 * shared key (`STATS_KEY`, presented as a bearer token). Every query is sampling-aware
 * (`_sample_interval`) and written against the column layout in src/telemetry/points.ts.
 */
export async function handleStats(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return jsonError(405, 'method not allowed');
  const missing = (['STATS_KEY', 'CF_ACCOUNT_ID', 'CF_ANALYTICS_TOKEN'] as const).filter((k) => !env[k]);
  if (missing.length) return jsonError(503, 'stats not configured', { missing, hint: 'npx wrangler secret put <NAME> — see docs/telemetry.md' });
  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!presented || !(await secretsMatch(presented, env.STATS_KEY!))) return jsonError(401, 'unauthorized');

  const url = new URL(request.url);
  const range = url.searchParams.get('range') ?? '24h';
  if (!isStatsRange(range)) return jsonError(400, 'bad range');
  // Production shows production; a preview Worker shows its own rows. `env=all` lifts the filter.
  const envParam = url.searchParams.get('env') ?? String(env.ENVIRONMENT);
  if (!/^[a-z-]{1,24}$/.test(envParam)) return jsonError(400, 'bad env');
  const environment = envParam === 'all' ? '' : envParam;

  try {
    const body = await collectStats({ accountId: env.CF_ACCOUNT_ID!, token: env.CF_ANALYTICS_TOKEN! }, range, environment);
    return Response.json(body, { headers: { 'cache-control': 'private, max-age=30' } });
  } catch (err) {
    console.error(JSON.stringify({ event: 'stats.query_failed', message: err instanceof Error ? err.message : String(err) }));
    return jsonError(502, 'analytics query failed', { message: err instanceof Error ? err.message : String(err) });
  }
}

type SqlAuth = { accountId: string; token: string };
type Row = Record<string, unknown>;

const RANGE_SQL: Record<StatsRange, { interval: string; bucket: number }> = {
  '1h': { interval: "INTERVAL '1' HOUR", bucket: 300 },
  '24h': { interval: "INTERVAL '24' HOUR", bucket: 3600 },
  '7d': { interval: "INTERVAL '7' DAY", bucket: 6 * 3600 },
  '30d': { interval: "INTERVAL '30' DAY", bucket: 86_400 },
};

export async function collectStats(auth: SqlAuth, range: StatsRange, environment: string): Promise<StatsResponse> {
  const { interval, bucket } = RANGE_SQL[range];
  // Only constants and values validated above reach the SQL text; the dashboard cannot inject.
  const where = (table: string, extra = '') => `FROM ${table} WHERE timestamp > NOW() - ${interval}${environment ? ` AND blob1 = '${environment}'` : ''}${extra}`;
  const t = `intDiv(toUInt32(timestamp), ${bucket}) * ${bucket} AS t`;
  const n = 'SUM(_sample_interval)';
  const w = (col: string) => `SUM(_sample_interval * ${col})`;
  const q = (p: number, col: string) => `quantileExactWeighted(${p})(${col}, _sample_interval)`;
  // Every online participant reports its own match rows; counting non-clients counts each match once.
  const oneMatch = " AND blob5 != 'client'";
  const S = DATASETS.sessions;
  const M = DATASETS.matches;
  const P = DATASETS.perf;
  const E = DATASETS.errors;
  const R = DATASETS.relay;

  const sql = (text: string) => runSql(auth, text);
  const [
    sessions,
    matches,
    sessionsByTime,
    matchesByTime,
    modes,
    levels,
    outcomes,
    devices,
    countries,
    perfByTime,
    perfByRenderer,
    perfByBrowser,
    errors,
    relay,
    roomSizes,
    online,
  ] = await Promise.all([
    sql(`SELECT ${n} AS sessions ${where(S)}`),
    sql(
      `SELECT sumIf(_sample_interval, blob3 = 'start'${oneMatch}) AS started, sumIf(_sample_interval, blob3 = 'end' AND blob8 = 'finished'${oneMatch}) AS finished, ` +
        `sumIf(_sample_interval * double6, blob3 = 'end'${oneMatch}) AS play_seconds, sumIf(_sample_interval * double8, blob3 = 'end'${oneMatch}) AS kills, ` +
        `count(DISTINCT index1) AS players ${where(M)}`,
    ),
    sql(`SELECT ${t}, ${n} AS sessions ${where(S)} GROUP BY t ORDER BY t`),
    sql(`SELECT ${t}, ${n} AS matches ${where(M, ` AND blob3 = 'start'${oneMatch}`)} GROUP BY t ORDER BY t`),
    sql(
      `SELECT blob4 AS mode, sumIf(_sample_interval, blob3 = 'start') AS started, sumIf(_sample_interval, blob3 = 'end') AS ended, ` +
        `sumIf(_sample_interval * double6, blob3 = 'end') AS seconds, sumIf(_sample_interval * double2, blob3 = 'start') AS humans, ` +
        `sumIf(_sample_interval * double3, blob3 = 'start') AS bots, sumIf(_sample_interval * double8, blob3 = 'end') AS kills ` +
        `${where(M, oneMatch)} GROUP BY mode ORDER BY started DESC`,
    ),
    sql(`SELECT blob6 AS level, ${n} AS started ${where(M, ` AND blob3 = 'start'${oneMatch}`)} GROUP BY level ORDER BY started DESC LIMIT 30`),
    sql(`SELECT blob8 AS outcome, ${n} AS count ${where(M, ` AND blob3 = 'end'`)} GROUP BY outcome ORDER BY count DESC`),
    sql(`SELECT blob3 AS device, blob4 AS os, blob5 AS browser, ${n} AS sessions ${where(S)} GROUP BY device, os, browser ORDER BY sessions DESC LIMIT 40`),
    sql(`SELECT blob2 AS country, ${n} AS sessions ${where(S)} GROUP BY country ORDER BY sessions DESC LIMIT 30`),
    sql(
      `SELECT ${t}, ${q(0.5, 'double3')} AS p50, ${q(0.5, 'double4')} AS p95, ${q(0.5, 'double5')} AS p99, ${w('double8')} AS long20, ${w('double2')} AS seconds, ${n} AS samples ` +
        `${where(P)} GROUP BY t ORDER BY t`,
    ),
    sql(perfGroupQuery('blob5', 'blob7', where(P))),
    sql(perfGroupQuery('blob9', 'blob8', where(P))),
    sql(`SELECT blob3 AS kind, blob4 AS message, blob5 AS source, ${n} AS count, MAX(timestamp) AS last_seen ${where(E)} GROUP BY kind, message, source ORDER BY count DESC LIMIT 60`),
    sql(`SELECT blob3 AS event, blob5 AS reason, ${n} AS count, ${w('double3')} AS seconds ${where(R)} GROUP BY event, reason ORDER BY count DESC LIMIT 40`),
    sql(`SELECT double2 AS peers, ${n} AS rooms ${where(R, ` AND blob3 = 'join'`)} GROUP BY peers ORDER BY peers`),
    sql(`SELECT ${q(0.5, 'double17')} AS rtt_p50, ${q(0.95, 'double17')} AS rtt_p95, ${w('double18')} AS desyncs, ${n} AS samples, ${w('double2')} AS seconds ${where(P, " AND blob3 = 'online'")}`),
  ]);

  const m = matches[0] ?? {};
  const totalStarted = num(m, 'started');
  const o = online[0] ?? {};
  return {
    range,
    environment: environment || 'all',
    generatedAt: new Date().toISOString(),
    bucketSeconds: bucket,
    totals: {
      sessions: num(sessions[0], 'sessions'),
      players: num(m, 'players'),
      matchesStarted: totalStarted,
      matchesFinished: num(m, 'finished'),
      playSeconds: num(m, 'play_seconds'),
      kills: num(m, 'kills'),
      roomsOpened: relay.filter((r) => str(r, 'event') === 'open').reduce((acc, r) => acc + num(r, 'count'), 0),
      errors: errors.reduce((acc, r) => acc + num(r, 'count'), 0),
    },
    timeline: mergeTimeline(sessionsByTime, matchesByTime),
    modes: modes.map((r) => {
      const started = num(r, 'started');
      const ended = num(r, 'ended');
      return {
        mode: str(r, 'mode'),
        started,
        ended,
        avgSeconds: ratio(num(r, 'seconds'), ended),
        avgHumans: ratio(num(r, 'humans'), started),
        avgBots: ratio(num(r, 'bots'), started),
        kills: num(r, 'kills'),
      };
    }),
    levels: levels.map((r) => ({ level: str(r, 'level'), started: num(r, 'started'), share: ratio(num(r, 'started'), totalStarted) })),
    outcomes: outcomes.map((r) => ({ outcome: str(r, 'outcome') || 'unknown', count: num(r, 'count') })),
    devices: devices.map((r) => ({ device: str(r, 'device'), os: str(r, 'os'), browser: str(r, 'browser'), sessions: num(r, 'sessions') })),
    countries: countries.map((r) => ({ country: str(r, 'country'), sessions: num(r, 'sessions') })),
    perfTimeline: perfByTime.map(
      (r): PerfTimelinePoint => ({
        t: num(r, 't'),
        p50: round(num(r, 'p50')),
        p95: round(num(r, 'p95')),
        p99: round(num(r, 'p99')),
        long20PerMin: perMinute(num(r, 'long20'), num(r, 'seconds')),
        samples: num(r, 'samples'),
      }),
    ),
    perfByRenderer: perfByRenderer.map(perfGroupRow),
    perfByBrowser: perfByBrowser.map(perfGroupRow),
    errors: errors.map(
      (r): ErrorRow => ({ kind: str(r, 'kind'), message: str(r, 'message'), source: str(r, 'source'), count: num(r, 'count'), lastSeen: str(r, 'last_seen') }),
    ),
    relay: relay.map((r): RelayRow => ({ event: str(r, 'event'), reason: str(r, 'reason'), count: num(r, 'count'), avgSeconds: ratio(num(r, 'seconds'), num(r, 'count')) })),
    roomSizes: roomSizes.map((r) => ({ peers: num(r, 'peers'), rooms: num(r, 'rooms') })),
    online: {
      rttP50: round(num(o, 'rtt_p50')),
      rttP95: round(num(o, 'rtt_p95')),
      desyncs: num(o, 'desyncs'),
      samples: num(o, 'samples'),
      minutes: round(num(o, 'seconds') / 60),
    },
  };
}

/** Frame pacing grouped by two dimensions (renderer × device, browser × os): medians of the per-sample percentiles, and long-frame rates. */
function perfGroupQuery(groupCol: string, subCol: string, from: string): string {
  const w = (col: string) => `SUM(_sample_interval * ${col})`;
  const q = (col: string) => `quantileExactWeighted(0.5)(${col}, _sample_interval)`;
  return (
    `SELECT ${groupCol} AS grp, ${subCol} AS sub, SUM(_sample_interval) AS samples, ${w('double2')} AS seconds, ` +
    `${q('double3')} AS p50, ${q('double4')} AS p95, ${q('double5')} AS p99, ${w('double8')} AS long20, ${w('double9')} AS long50, ` +
    `${w('double10')} AS sim, ${w('double11')} AS build, ${w('double12')} AS render, ${w('double13')} AS gpu, ${w('double15')} AS res_scale ` +
    `${from} GROUP BY grp, sub ORDER BY seconds DESC LIMIT 30`
  );
}

function perfGroupRow(r: Row): PerfGroupRow {
  const samples = num(r, 'samples');
  const seconds = num(r, 'seconds');
  return {
    group: str(r, 'grp'),
    sub: str(r, 'sub'),
    samples,
    minutes: round(seconds / 60),
    p50: round(num(r, 'p50')),
    p95: round(num(r, 'p95')),
    p99: round(num(r, 'p99')),
    long20PerMin: perMinute(num(r, 'long20'), seconds),
    long50PerMin: perMinute(num(r, 'long50'), seconds),
    sim: round(ratio(num(r, 'sim'), samples)),
    build: round(ratio(num(r, 'build'), samples)),
    render: round(ratio(num(r, 'render'), samples)),
    gpu: round(ratio(num(r, 'gpu'), samples)),
    resScale: round(ratio(num(r, 'res_scale'), samples)),
  };
}

function mergeTimeline(sessions: Row[], matches: Row[]): TimelinePoint[] {
  const byT = new Map<number, TimelinePoint>();
  for (const r of sessions) {
    const t = num(r, 't');
    byT.set(t, { t, sessions: num(r, 'sessions'), matches: 0 });
  }
  for (const r of matches) {
    const t = num(r, 't');
    const p = byT.get(t) ?? { t, sessions: 0, matches: 0 };
    p.matches = num(r, 'matches');
    byT.set(t, p);
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

/** One SQL API call; the response's `data` rows. Throws with the API's own message on failure. */
async function runSql(auth: SqlAuth, query: string): Promise<Row[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${auth.accountId}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth.token}` },
    body: `${query} FORMAT JSON`,
  });
  const text = await res.text();
  if (!res.ok) {
    // A dataset that has never been written to is "unknown table" until the first event lands;
    // that is an empty result, not an outage.
    if (/unknown table|does not exist|doesn't exist/i.test(text)) return [];
    throw new Error(`SQL API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as { data?: Row[] };
  return json.data ?? [];
}

// ClickHouse's JSON output quotes 64-bit integers, so every number is coerced on the way out.
function num(row: Row | undefined, key: string): number {
  const v = row?.[key];
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0;
  return Number.isFinite(x) ? x : 0;
}

function str(row: Row | undefined, key: string): string {
  const v = row?.[key];
  return v === null || v === undefined ? '' : String(v);
}

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

function perMinute(count: number, seconds: number): number {
  return seconds > 0 ? round((count / seconds) * 60) : 0;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
