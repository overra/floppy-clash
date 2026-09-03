import type { PlayerInput } from '../sim/input';
import type { WorldSnapshot } from '../sim/snapshot';

export type NetMessage =
  | { t: 'hello'; name: string }
  | { t: 'room'; code: string }
  | { t: 'input'; tick: number; slot: number; bundle: PlayerInput[] }
  | { t: 'snapshot'; snap: WorldSnapshot }
  | { t: 'event'; kind: string; payload: string }
  | { t: 'chat'; from: string; text: string }
  | { t: 'level'; json: string }
  | { t: 'settings'; json: string }
  | { t: 'sdp'; desc: RTCSessionDescriptionInit }
  | { t: 'ice'; cand: RTCIceCandidateInit };

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): NetMessage {
  return JSON.parse(raw) as NetMessage;
}

export function quantizeInput(input: PlayerInput): PlayerInput {
  return {
    ...input,
    moveX: Math.round(input.moveX * 64) / 64,
    aimX: Math.round(input.aimX * 64) / 64,
    aimY: Math.round(input.aimY * 64) / 64,
  };
}
