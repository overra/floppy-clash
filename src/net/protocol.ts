import type { PlayerInput } from '../sim/input';
import type { WorldSnapshot } from '../sim/snapshot';

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

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
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
