import type { TelemetryBatch, TelemetryEvent } from './schema';

/**
 * How a telemetry batch becomes Workers Analytics Engine rows. This is the schema of the datasets:
 * blobs are the dimensions you GROUP BY, doubles the numbers you SUM/quantile, index1 the sampling
 * key. `blob1` is always the deployment environment and `blob2` the visitor's country so every
 * dataset filters the same way. Column order is load-bearing — Analytics Engine columns are
 * positional (`blob1..blob20`, `double1..double20`) — so extend at the end, never in the middle.
 *
 * Shared by the Worker (which writes) and the tests; the dashboard queries in worker/stats.ts read
 * these columns back by number. docs/telemetry.md is the human-readable copy of this table.
 */

export type DataPoint = { blobs: string[]; doubles: number[]; indexes: string[] };

export type ClientDataset = 'sessions' | 'matches' | 'perf' | 'errors';

/** Dataset (table) names as they appear in the SQL API, by the binding that writes them. */
export const DATASETS = {
  sessions: 'floppy_clash_sessions',
  matches: 'floppy_clash_matches',
  perf: 'floppy_clash_perf',
  errors: 'floppy_clash_errors',
  /** Written by the room relay (worker/room.ts), never by browsers. */
  relay: 'floppy_clash_relay',
} as const;

export type PointMeta = {
  /** `production`, `preview`, `development` — from the Worker's ENVIRONMENT var. */
  environment: string;
  /** ISO 3166-1 alpha-2 from `request.cf.country`, or `XX`. */
  country: string;
};

/**
 * sessions — one row per page load.
 *   blob1 env · blob2 country · blob3 device · blob4 os · blob5 browser · blob6 renderer setting
 *   blob7 entry · blob8 standalone
 *   double1 1 · double2 width · double3 height · double4 dpr · double5 cores · double6 memory
 *   double7 touch · double8 gamepads
 * matches — a `start` row when a match begins and an `end` row when it stops, per browser.
 *   blob1 env · blob2 country · blob3 phase · blob4 mode · blob5 role · blob6 level · blob7 renderer
 *   blob8 outcome (end only) · blob9 device · blob10 os · blob11 browser
 *   double1 1 · double2 humans · double3 bots · double4 firstTo · double5 maxHp · double6 seconds
 *   double7 rounds · double8 kills · double9 won · double10 longFrames
 * perf — a frame-pacing summary every 60 s of play and at the end of a match.
 *   blob1 env · blob2 country · blob3 mode · blob4 role · blob5 renderer · blob6 reason
 *   blob7 device · blob8 os · blob9 browser · blob10 lighting
 *   double1 frames · double2 seconds · double3 p50 · double4 p95 · double5 p99 · double6 max
 *   double7 long12 · double8 long20 · double9 long50 · double10 sim · double11 build
 *   double12 render · double13 gpu · double14 particles · double15 resScale · double16 players
 *   double17 rtt · double18 desyncs · double19 heap
 * errors — script errors, frame errors, WebGPU fallbacks, desyncs, refused room connections.
 *   blob1 env · blob2 country · blob3 kind · blob4 message · blob5 source · blob6 context
 *   blob7 renderer · blob8 device · blob9 os · blob10 browser
 *   double1 1
 * Every client row: index1 = session id.
 */
export function toDataPoints(batch: TelemetryBatch, meta: PointMeta): { dataset: ClientDataset; point: DataPoint }[] {
  const head = [meta.environment, meta.country];
  const dev = [batch.ctx.device, batch.ctx.os, batch.ctx.browser];
  const idx = [batch.sid];
  return batch.events.map((e) => ({ dataset: datasetOf(e), point: pointOf(e, head, dev, idx) }));
}

function datasetOf(e: TelemetryEvent): ClientDataset {
  switch (e.k) {
    case 'page':
      return 'sessions';
    case 'match':
      return 'matches';
    case 'perf':
      return 'perf';
    case 'error':
      return 'errors';
  }
}

function pointOf(e: TelemetryEvent, head: string[], dev: string[], indexes: string[]): DataPoint {
  switch (e.k) {
    case 'page':
      return {
        blobs: [...head, ...dev, e.renderer, e.entry, flag(e.standalone)],
        doubles: [1, e.width, e.height, e.dpr, e.cores, e.memory, bit(e.touch), e.gamepads],
        indexes,
      };
    case 'match':
      return {
        blobs: [...head, e.phase, e.mode, e.role, e.level, e.renderer, e.outcome ?? '', ...dev],
        doubles: [1, e.humans, e.bots, e.firstTo, e.maxHp, e.seconds, e.rounds, e.kills, bit(e.won), e.longFrames],
        indexes,
      };
    case 'perf':
      return {
        blobs: [...head, e.mode, e.role, e.renderer, e.reason, ...dev, flag(e.lighting)],
        doubles: [
          e.frames,
          e.seconds,
          e.p50,
          e.p95,
          e.p99,
          e.max,
          e.long12,
          e.long20,
          e.long50,
          e.sim,
          e.build,
          e.render,
          e.gpu,
          e.particles,
          e.resScale,
          e.players,
          e.rtt,
          e.desyncs,
          e.heap,
        ],
        indexes,
      };
    case 'error':
      return {
        blobs: [...head, e.kind, e.message, e.source, e.context, e.renderer, ...dev],
        doubles: [1],
        indexes,
      };
  }
}

/**
 * relay — room lifecycle as the Durable Object sees it (worker/room.ts).
 *   blob1 env · blob2 country · blob3 event (open | join | refuse | leave | close) · blob4 role
 *   blob5 reason (refusal code, or the WebSocket close code) · blob6 colo
 *   double1 1 · double2 peers in the room after the event · double3 seconds this socket was connected
 *   index1 = room instance id (random per hosting, not the room code)
 */
export function relayPoint(p: {
  environment: string;
  country: string;
  event: 'open' | 'join' | 'refuse' | 'leave' | 'close';
  role: 'host' | 'client';
  reason: string;
  colo: string;
  peers: number;
  seconds: number;
  roomInstance: string;
}): DataPoint {
  return {
    blobs: [p.environment, p.country, p.event, p.role, p.reason, p.colo],
    doubles: [1, p.peers, p.seconds],
    indexes: [p.roomInstance],
  };
}

const bit = (b: boolean): number => (b ? 1 : 0);
const flag = (b: boolean): string => (b ? '1' : '0');
