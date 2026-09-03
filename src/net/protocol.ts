import type { PlayerInput } from '../sim/input';
import type { WorldSnapshot } from '../sim/snapshot';
import { bytesFromWire, decodeSnapshotBinary, encodeSnapshotBinary } from './snapshotWire';

export type NetMessage =
  | { t: 'hello'; name: string }
  | { t: 'room'; code: string; role?: PeerRoleHint }
  | { t: 'you'; id: string }
  | { t: 'peer-join'; id: string }
  | { t: 'peers'; n: number }
  | { t: 'input'; tick: number; slot: number; bundle: PlayerInput[] }
  | { t: 'snapshot'; snap: WorldSnapshot }
  | { t: 'event'; kind: string; payload: string }
  | { t: 'chat'; from: string; text: string }
  | { t: 'level'; json: string }
  | { t: 'settings'; json: string }
  | { t: 'sdp'; desc: RTCSessionDescriptionInit; to?: string; from?: string }
  | { t: 'ice'; cand: RTCIceCandidateInit; to?: string; from?: string };

export type PeerRoleHint = 'host' | 'client';

export type WirePayload = string | Uint8Array;

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
}

export {
  decodeSnapshotBinary,
  encodeSnapshotBinary,
  snapshotBytes,
  SNAPSHOT_WIRE_VERSION,
} from './snapshotWire';

/** PLAN 4.13: snapshots are quantized binary; everything else stays JSON. */
export function encodeWire(msg: NetMessage): WirePayload {
  if (msg.t === 'snapshot') return encodeSnapshotBinary(msg.snap);
  return encode(msg);
}

export function decodeWire(data: unknown): NetMessage {
  if (typeof data === 'string') return decode(data);
  const buf = bytesFromWire(data);
  if (!buf) throw new Error('decodeWire: empty payload');
  return { t: 'snapshot', snap: decodeSnapshotBinary(buf) };
}

export function wireBytes(msg: NetMessage): number {
  const payload = encodeWire(msg);
  return typeof payload === 'string' ? payload.length : payload.byteLength;
}

export function decode(raw: string): NetMessage {
  return JSON.parse(raw) as NetMessage;
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
