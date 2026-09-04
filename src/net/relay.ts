/**
 * The wire format between a browser and the room relay (`worker/room.ts`).
 *
 * The relay knows nothing about the game: it hands out peer ids, tells everyone who is in the room
 * and forwards opaque game messages (`m`) between the host and its clients. This file is shared by
 * both bundles, so it must stay free of DOM and Workers runtime types.
 */

export type PeerInfo = { id: number; name: string };

export type RelayErrorCode = 'room-taken' | 'no-such-room' | 'room-full';

export type RelayToPeer =
  /** First message after connecting: who you are, who hosts, who is already here (including you). */
  | { t: 'welcome'; id: number; hostId: number; peers: PeerInfo[] }
  | { t: 'peer'; peer: PeerInfo }
  | { t: 'left'; id: number }
  /** The room is over (the host left); the socket closes right after. */
  | { t: 'closed'; reason: string }
  /** The connection was refused; the socket closes right after. */
  | { t: 'error'; code: RelayErrorCode }
  /** A game message forwarded from another peer. */
  | { t: 'from'; from: number; m: unknown };

/** Clients may only address the host; the host may address one peer or everyone else. */
export type RelayFromPeer = { t: 'to'; to: number | 'host' | 'all'; m: unknown };

/** Host plus up to three clients: the sim has four fighter slots. */
export const MAX_PEERS = 4;

/** Biggest game message the relay forwards (a match start carries the host's custom levels). */
export const MAX_MESSAGE_CHARS = 256 * 1024;

/** Room codes avoid 0/O and 1/I so they survive being read out loud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function isRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code);
}

export function randomRoomCode(rand: () => number = Math.random, length = 5): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out +=
      ROOM_CODE_ALPHABET[
        Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(rand() * ROOM_CODE_ALPHABET.length))
      ];
  }
  return out;
}

export function cleanPeerName(raw: string | null | undefined, fallback = 'Player'): string {
  let name = '';
  for (const ch of raw ?? '') {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) name += ch;
  }
  name = name.trim().slice(0, 20);
  return name || fallback;
}

export const RELAY_ERROR_TEXT: Record<RelayErrorCode, string> = {
  'room-taken': 'That room code is already hosted — pick another.',
  'no-such-room': 'No room with that code is open right now.',
  'room-full': 'That room is full (4 players).',
};
