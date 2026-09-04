import type { PlayerInput } from '../sim/input';
import type { LevelDef } from '../sim/level/schema';
import type { MatchSettings } from '../sim/rules/settings';
import type { WorldSnapshot } from '../sim/snapshot';

/**
 * Game messages exchanged through the room relay (`src/net/room.ts`).
 *
 * Online play is a host-authoritative mirror: every peer runs the same deterministic sim; clients
 * send their `PlayerInput`, the host steps the match and broadcasts the exact inputs it stepped each
 * tick (`frames`), and clients step through those. Nothing but inputs crosses the wire during play.
 */

/** `[moveX, aimX, aimY, buttons]`, analog axes as integers in 1/1000ths (see {@link packInput}). */
export type PackedInput = [number, number, number, number];

/** Who stands in each fighter slot of an online match; `peer: null` is a bot. */
export type MatchSlot = { peer: number | null; name: string; color: number };

/** The rules every peer must create its sim with, so the mirrors agree. */
export type MatchRules = Pick<
  MatchSettings,
  'maxHp' | 'firstTo' | 'showWins' | 'rotation' | 'enabledWeapons' | 'enabledLevels'
>;

export type LobbyPeerState = { id: number; name: string; slot: number; color: number };

export type NetMessage =
  /** Host → all: the lobby as the host sees it, whenever it changes. */
  | {
      t: 'lobby';
      peers: LobbyPeerState[];
      maxHp: number;
      firstTo: number;
      bots: number;
      inMatch: boolean;
    }
  /** Host → all: create your sim exactly like this and start stepping when frames arrive. */
  | {
      t: 'start';
      seed: number;
      levelId: string;
      slots: MatchSlot[];
      rules: MatchRules;
      extraLevels: LevelDef[];
    }
  /** Client → host: my input right now (sent when it changes, at most once per tick). */
  | { t: 'input'; input: PackedInput }
  /** Host → all: the inputs stepped for ticks `start .. start + frames.length - 1`, plus a hash to check against. */
  | { t: 'frames'; start: number; frames: PackedInput[][]; hash?: { tick: number; h: string } }
  /** Host → all: the match is over; back to the lobby. */
  | { t: 'end'; reason: string }
  | { t: 'chat'; from: string; text: string }
  /** Client → host: my hash disagreed with yours; send me your state. */
  | { t: 'resync'; tick: number }
  /** Host → one client: a state snapshot to apply when the client reaches its tick. */
  | { t: 'snapshot'; snap: WorldSnapshot }
  | { t: 'hello'; name: string }
  | { t: 'event'; kind: string; payload: string }
  | { t: 'level'; json: string }
  | { t: 'settings'; json: string };

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): NetMessage {
  return JSON.parse(raw) as NetMessage;
}

/** Wire resolution of the analog axes. Direction error at 1/1000 is under a tenth of a degree. */
const AXIS_Q = 1000;
const B_JUMP = 1;
const B_DOWN = 2;
const B_ATTACK = 4;
const B_BLOCK = 8;
const B_THROW = 16;

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0;
}

/**
 * Quantize an input for the wire. The aim vector is normalized first (the sim normalizes anyway, so
 * only its direction matters) and every peer that unpacks the result gets bit-identical doubles.
 */
export function packInput(input: PlayerInput): PackedInput {
  let ax = clamp(input.aimX, -1e6, 1e6);
  let ay = clamp(input.aimY, -1e6, 1e6);
  const len = Math.hypot(ax, ay);
  if (len > 1e-6) {
    ax /= len;
    ay /= len;
  } else {
    ax = 1;
    ay = 0;
  }
  const bits =
    (input.jump ? B_JUMP : 0) |
    (input.down ? B_DOWN : 0) |
    (input.attack ? B_ATTACK : 0) |
    (input.block ? B_BLOCK : 0) |
    (input.throw ? B_THROW : 0);
  return [
    Math.round(clamp(input.moveX, -1, 1) * AXIS_Q),
    Math.round(ax * AXIS_Q),
    Math.round(ay * AXIS_Q),
    bits,
  ];
}

export function unpackInput(p: PackedInput): PlayerInput {
  const bits = p[3] | 0;
  return {
    moveX: (p[0] | 0) / AXIS_Q,
    aimX: (p[1] | 0) / AXIS_Q,
    aimY: (p[2] | 0) / AXIS_Q,
    jump: (bits & B_JUMP) !== 0,
    down: (bits & B_DOWN) !== 0,
    attack: (bits & B_ATTACK) !== 0,
    block: (bits & B_BLOCK) !== 0,
    throw: (bits & B_THROW) !== 0,
  };
}

/** The input the host actually steps with: what the wire can carry, so clients reproduce it exactly. */
export function wireInput(input: PlayerInput): PlayerInput {
  return unpackInput(packInput(input));
}

export function samePacked(a: PackedInput | null, b: PackedInput): boolean {
  return !!a && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** Latest analog state, but every button pressed in any of the inputs stays pressed: a tap survives. */
export function mergePresses(latest: PackedInput, earlier: PackedInput): PackedInput {
  return [latest[0], latest[1], latest[2], latest[3] | earlier[3]];
}

/** Quantized binary snapshot for the < 30 KB/s budget (20 Hz). */
export function encodeSnapshotBinary(snap: WorldSnapshot): Uint8Array {
  const n = snap.entities.length;
  const buf = new ArrayBuffer(16 + n * 16);
  const view = new DataView(buf);
  view.setUint32(0, snap.tick, true);
  view.setUint32(4, snap.rng, true);
  view.setUint16(8, snap.nextId, true);
  view.setUint16(10, n, true);
  let o = 16;
  for (const e of snap.entities) {
    view.setUint16(o, e.netId, true);
    const t = e.traits.Transform;
    view.setInt16(o + 2, Math.round(Number(t?.x ?? 0) * 100), true);
    view.setInt16(o + 4, Math.round(Number(t?.y ?? 0) * 100), true);
    view.setInt16(o + 6, Math.round(Number(t?.angle ?? 0) * 1000), true);
    const h = e.traits.Health;
    view.setUint16(o + 8, Math.max(0, Math.round(Number(h?.hp ?? 0))), true);
    const p = e.traits.Player;
    view.setUint8(o + 10, Number(p?.slot ?? 255));
    o += 16;
  }
  return new Uint8Array(buf, 0, o);
}

export function snapshotBytes(snap: WorldSnapshot): number {
  return encodeSnapshotBinary(snap).byteLength;
}

export function hostContentMessages(settingsJson: string, levelJson: string): NetMessage[] {
  return [
    { t: 'settings', json: settingsJson },
    { t: 'level', json: levelJson },
  ];
}

export function lateJoinSnapshotMessage(snap: WorldSnapshot): NetMessage {
  return { t: 'snapshot', snap };
}

export function quantizeInput(input: PlayerInput): PlayerInput {
  return {
    ...input,
    moveX: Math.round(input.moveX * 64) / 64,
    aimX: Math.round(input.aimX * 64) / 64,
    aimY: Math.round(input.aimY * 64) / 64,
  };
}
