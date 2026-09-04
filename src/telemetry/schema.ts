import { z } from 'zod';

/**
 * The wire format between the game and `POST /api/telemetry` (worker/telemetry.ts).
 *
 * Shared by both bundles, so: no DOM, no Workers runtime types. Everything here is anonymous by
 * construction — no names, nothing that outlives the page load (the session id is random per load
 * and never stored), no free text beyond truncated error messages. Enumerations are closed so a
 * row can never carry more than the dashboard knows how to group by.
 */

export const TELEMETRY_VERSION = 1;
/** Events per POST; the Worker writes one Analytics Engine point per event (limit 250 / request). */
export const MAX_EVENTS_PER_BATCH = 50;
/** Request body cap enforced before parsing (a batch of 50 events is well under 16 KB). */
export const MAX_BATCH_BYTES = 32 * 1024;

const text = (max: number) => z.string().max(max);
/** Identifiers and enumerations: level ids, device names — never prose. */
const token = (max = 32) => z.string().regex(/^[a-z0-9_-]*$/i).max(max);
const num = z.number().finite();
const count = num.min(0);

export const gameModeSchema = z.enum(['local', 'solo', 'online']);
/** Where an event happened: in the menus, or in a match of the given mode. */
export const contextSchema = z.enum(['menu', 'local', 'solo', 'online']);
export const roleSchema = z.enum(['offline', 'host', 'client']);
export const rendererSchema = z.enum(['gpu', 'canvas']);
export const outcomeSchema = z.enum([
  /** The rules ended it (first-to reached). */
  'finished',
  /** Quit from the pause card (couch / solo). */
  'quit',
  /** Online: the host ended it for everyone. */
  'host-ended',
  /** Online: this browser left the match on its own. */
  'left',
  /** Online: the room closed or the connection dropped mid-match. */
  'disconnected',
  /** A new match was started over this one (rematch, editor playtest). */
  'restarted',
  /** The page was closed or navigated away while the match ran. */
  'unload',
]);
export const errorKindSchema = z.enum(['js', 'rejection', 'frame', 'gpu-fallback', 'desync', 'room']);
export const perfReasonSchema = z.enum(['periodic', 'end']);

export const pageEventSchema = z.object({
  k: z.literal('page'),
  /** The renderer *setting*; what actually rendered is on match/perf rows. */
  renderer: z.enum(['auto', 'gpu', 'canvas']),
  /** Landed on an invite link (`?room=`) or opened the game directly. */
  entry: z.enum(['direct', 'invite']),
  /** Installed as a PWA. */
  standalone: z.boolean(),
  width: count.max(20_000),
  height: count.max(20_000),
  dpr: count.max(10),
  cores: count.max(1024),
  /** `navigator.deviceMemory` in GB (Chrome only), 0 elsewhere. */
  memory: count.max(1024),
  touch: z.boolean(),
  gamepads: count.max(16),
});

export const matchEventSchema = z.object({
  k: z.literal('match'),
  phase: z.enum(['start', 'end']),
  mode: gameModeSchema,
  role: roleSchema,
  /** Built-in level id, or `custom` for anything from the editor. */
  level: token(48),
  renderer: rendererSchema,
  humans: count.max(4),
  bots: count.max(4),
  firstTo: count.max(999),
  maxHp: count.max(99_999),
  /** End rows only; start rows carry zeros. */
  outcome: outcomeSchema.optional(),
  seconds: count.max(7 * 86_400),
  rounds: count.max(100_000),
  kills: count.max(1_000_000),
  /** Whether the fighter this browser steered won (finished matches only). */
  won: z.boolean(),
  /** rAF gaps over 12 ms during this match. */
  longFrames: count,
});

/** A frame-pacing summary for a slice of play: every 60 s and at the end of a match. */
export const perfEventSchema = z.object({
  k: z.literal('perf'),
  mode: gameModeSchema,
  role: roleSchema,
  renderer: rendererSchema,
  reason: perfReasonSchema,
  lighting: z.boolean(),
  frames: count,
  seconds: count,
  /** rAF interval percentiles / max in ms. */
  p50: count,
  p95: count,
  p99: count,
  max: count,
  /** Frames whose interval exceeded 12 / 20 / 50 ms (missed 120 Hz, missed 60 Hz, hitch). */
  long12: count,
  long20: count,
  long50: count,
  /** Mean per-frame stage cost in ms. */
  sim: count,
  build: count,
  render: count,
  gpu: count,
  /** Mean live particle count. */
  particles: count,
  /** Dynamic resolution scale the renderer settled on. */
  resScale: count.max(4),
  players: count.max(8),
  /** Online: relay round trip in ms and resyncs requested; 0 offline. */
  rtt: count,
  desyncs: count,
  /** JS heap in MB (Chrome only), 0 elsewhere. */
  heap: count,
});

export const errorEventSchema = z.object({
  k: z.literal('error'),
  kind: errorKindSchema,
  message: text(300),
  /** `file:line:col` for script errors, a code for the rest. */
  source: text(160),
  context: contextSchema,
  renderer: rendererSchema,
});

export const telemetryEventSchema = z.discriminatedUnion('k', [pageEventSchema, matchEventSchema, perfEventSchema, errorEventSchema]);

export const deviceInfoSchema = z.object({
  device: z.enum(['desktop', 'mobile', 'tablet']),
  os: token(16),
  browser: token(16),
});

export const telemetryBatchSchema = z.object({
  v: z.literal(TELEMETRY_VERSION),
  /** Random per page load; the sampling key and the only way rows from one visit relate. */
  sid: z.string().regex(/^[a-z0-9]{8,32}$/),
  ctx: deviceInfoSchema,
  events: z.array(telemetryEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export type GameMode = z.infer<typeof gameModeSchema>;
export type TelemetryContext = z.infer<typeof contextSchema>;
export type MatchRole = z.infer<typeof roleSchema>;
export type RendererKind = z.infer<typeof rendererSchema>;
export type MatchOutcome = z.infer<typeof outcomeSchema>;
export type ErrorKind = z.infer<typeof errorKindSchema>;
export type PageEvent = z.infer<typeof pageEventSchema>;
export type MatchEvent = z.infer<typeof matchEventSchema>;
export type PerfEvent = z.infer<typeof perfEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;
