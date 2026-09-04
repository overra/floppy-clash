/**
 * The shape `GET /api/stats` (worker/stats.ts) returns and the /stats dashboard (src/stats) renders.
 * Shared by both bundles, so no DOM and no Workers types. All numbers are already sampling-corrected
 * and ready to display; rates are per minute of play unless the name says otherwise.
 */

export const STATS_RANGES = ['1h', '24h', '7d', '30d'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export function isStatsRange(v: string): v is StatsRange {
  return (STATS_RANGES as readonly string[]).includes(v);
}

export type StatsTotals = {
  /** Page loads. */
  sessions: number;
  /** Distinct sessions that started at least one match. */
  players: number;
  /** Matches started (couch, solo and online hosts — online clients are the same match). */
  matchesStarted: number;
  /** Matches the rules ended (first-to reached). */
  matchesFinished: number;
  /** Wall-clock seconds of play reported by ended matches. */
  playSeconds: number;
  kills: number;
  roomsOpened: number;
  errors: number;
};

export type TimelinePoint = { t: number; sessions: number; matches: number };

export type ModeRow = { mode: string; started: number; ended: number; avgSeconds: number; avgHumans: number; avgBots: number; kills: number };
export type LevelRow = { level: string; started: number; share: number };
export type OutcomeRow = { outcome: string; count: number };
export type DeviceRow = { device: string; os: string; browser: string; sessions: number };
export type CountryRow = { country: string; sessions: number };

export type PerfTimelinePoint = { t: number; p50: number; p95: number; p99: number; long20PerMin: number; samples: number };
export type PerfGroupRow = {
  group: string;
  sub: string;
  samples: number;
  /** Minutes of play the samples cover. */
  minutes: number;
  p50: number;
  p95: number;
  p99: number;
  long20PerMin: number;
  long50PerMin: number;
  sim: number;
  build: number;
  render: number;
  gpu: number;
  resScale: number;
};
export type ErrorRow = { kind: string; message: string; source: string; count: number; lastSeen: string };
export type RelayRow = { event: string; reason: string; count: number; avgSeconds: number };
export type RoomSizeRow = { peers: number; rooms: number };
export type OnlineStats = { rttP50: number; rttP95: number; desyncs: number; samples: number; minutes: number };

export type StatsResponse = {
  range: StatsRange;
  environment: string;
  generatedAt: string;
  bucketSeconds: number;
  totals: StatsTotals;
  timeline: TimelinePoint[];
  modes: ModeRow[];
  levels: LevelRow[];
  outcomes: OutcomeRow[];
  devices: DeviceRow[];
  countries: CountryRow[];
  perfTimeline: PerfTimelinePoint[];
  perfByRenderer: PerfGroupRow[];
  perfByBrowser: PerfGroupRow[];
  errors: ErrorRow[];
  relay: RelayRow[];
  roomSizes: RoomSizeRow[];
  online: OnlineStats;
};
