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

/** Per-entity quantized motion: transform + BodyVel (PLAN 4.13). */
const ENTITY_STRIDE = 24;

function quantizeVel(rec: WorldSnapshot['entities'][number]): { vx: number; vy: number; omega: number } {
  const bv = rec.traits.BodyVel;
  if (bv) {
    return { vx: Number(bv.vx ?? 0), vy: Number(bv.vy ?? 0), omega: Number(bv.omega ?? 0) };
  }
  const fallback = rec.traits.Controller ?? rec.traits.Projectile;
  return { vx: Number(fallback?.vx ?? 0), vy: Number(fallback?.vy ?? 0), omega: 0 };
}

/** Quantized binary snapshot for the < 30 KB/s budget (20 Hz). */
export function encodeSnapshotBinary(snap: WorldSnapshot): Uint8Array {
  const n = snap.entities.length;
  const buf = new ArrayBuffer(16 + n * ENTITY_STRIDE);
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
    const v = quantizeVel(e);
    view.setInt16(o + 12, Math.round(v.vx * 100), true);
    view.setInt16(o + 14, Math.round(v.vy * 100), true);
    view.setInt16(o + 16, Math.round(v.omega * 100), true);
    o += ENTITY_STRIDE;
  }
  return new Uint8Array(buf, 0, o);
}

export function decodeSnapshotBinary(buf: Uint8Array): WorldSnapshot {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tick = view.getUint32(0, true);
  const rng = view.getUint32(4, true);
  const nextId = view.getUint16(8, true);
  const n = view.getUint16(10, true);
  const entities: WorldSnapshot['entities'] = [];
  let o = 16;
  for (let i = 0; i < n; i++) {
    const netId = view.getUint16(o, true);
    const x = view.getInt16(o + 2, true) / 100;
    const y = view.getInt16(o + 4, true) / 100;
    const angle = view.getInt16(o + 6, true) / 1000;
    const hp = view.getUint16(o + 8, true);
    const slot = view.getUint8(o + 10);
    const vx = view.getInt16(o + 12, true) / 100;
    const vy = view.getInt16(o + 14, true) / 100;
    const omega = view.getInt16(o + 16, true) / 100;
    const traits: WorldSnapshot['entities'][number]['traits'] = {
      Transform: { x, y, angle },
      BodyVel: { vx, vy, omega },
    };
    if (hp > 0) traits.Health = { hp, maxHp: hp };
    if (slot !== 255) traits.Player = { slot, color: 0, inputIndex: slot };
    entities.push({ netId, traits });
    o += ENTITY_STRIDE;
  }
  return { tick, rng, nextId, entities, full: true };
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
