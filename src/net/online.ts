import { blankInputs, EMPTY_INPUT, type PlayerInput } from '../sim/input';
import type { WorldSnapshot } from '../sim/snapshot';
import {
  mergePresses,
  packInput,
  samePacked,
  unpackInput,
  type MatchSlot,
  type PackedInput,
} from './protocol';

/**
 * Bookkeeping for one online match, kept free of DOM and game-loop concerns so it can be unit
 * tested. `game.ts` owns the sim and asks this module what to step with and when.
 */

/** How many frames a client likes to have in hand: ~50 ms of slack against network jitter. */
export const CLIENT_BUFFER_TARGET = 3;

/** The host hashes its world every this many ticks and clients check theirs against it. */
export const HASH_EVERY_TICKS = 60;

/** Remote inputs are folded into the sim one per tick; a backlog past this is caught up at once. */
const REMOTE_BACKLOG = 2;
const REMOTE_QUEUE_CAP = 16;

/** Minimum gap between two input messages from a client (one sim tick). */
const SEND_INTERVAL_MS = 15;

export type OnlineRole = 'host' | 'client';

/**
 * Host side: the latest input each remote fighter sent. Inputs are applied in the order they arrived,
 * one per tick, and the last one is held until the next arrives (a client that goes quiet keeps
 * doing what it was doing).
 */
export function createRemoteInputs(slots = 4) {
  const queues: PackedInput[][] = Array.from({ length: slots }, () => []);
  const held: PackedInput[] = blankInputs(slots).map(packInput);
  return {
    push(slot: number, packed: PackedInput): void {
      const q = queues[slot];
      if (!q) return;
      q.push(packed);
      if (q.length > REMOTE_QUEUE_CAP) {
        // Fold the oldest into its successor so a press inside it still lands.
        const dropped = q.shift()!;
        q[0] = mergePresses(q[0]!, dropped);
      }
    },
    /** The (still packed) input slot `slot` steps with this tick; the host broadcasts exactly this. */
    take(slot: number): PackedInput {
      const q = queues[slot];
      if (!q || q.length === 0) return held[slot] ?? packInput(EMPTY_INPUT);
      let next = q.shift()!;
      if (q.length > REMOTE_BACKLOG) {
        // Behind: fold everything but the newest into this tick (every press survives) and leave the
        // newest for the next tick, so a release recorded there is not swallowed by the merge.
        const newest = q[q.length - 1]!;
        for (let i = 0; i < q.length - 1; i++) next = mergePresses(q[i]!, next);
        q.length = 0;
        q.push(newest);
      }
      held[slot] = next;
      return next;
    },
    /** The peer left: their fighter stands still from now on. */
    clear(slot: number): void {
      const q = queues[slot];
      if (q) q.length = 0;
      held[slot] = packInput(EMPTY_INPUT);
    },
    pending(slot: number): number {
      return queues[slot]?.length ?? 0;
    },
  };
}

export type RemoteInputs = ReturnType<typeof createRemoteInputs>;

/**
 * Client side: turns the local input stream into as few messages as possible without losing a tap.
 * A message goes out when the quantized input differs from what the host holds, at most once per
 * sim tick; any button pressed between two sends is folded into the next one.
 */
export function createInputSender(send: (packed: PackedInput) => void) {
  let lastSent: PackedInput | null = null;
  let pressedSince = 0;
  let nextAt = 0;
  return {
    update(input: PlayerInput, nowMs: number): void {
      const p = packInput(input);
      pressedSince |= p[3];
      const candidate: PackedInput = [p[0], p[1], p[2], p[3] | pressedSince];
      if (samePacked(lastSent, candidate) || nowMs < nextAt) return;
      send(candidate);
      lastSent = candidate;
      pressedSince = 0;
      nextAt = nowMs + SEND_INTERVAL_MS;
    },
    get lastSent(): PackedInput | null {
      return lastSent;
    },
  };
}

/**
 * How many ticks a client steps this frame: what its own clock asks for, limited to the frames it
 * has, plus a burst when it has fallen far behind (a tab that was in the background).
 */
export function clientSteps(
  desired: number,
  buffered: number,
  target = CLIENT_BUFFER_TARGET,
): number {
  if (buffered === 0) return 0;
  let n = Math.min(desired, buffered);
  if (buffered > 30) n = Math.max(n, Math.min(buffered - target, buffered > 300 ? 60 : 10));
  return n;
}

/**
 * Nudge the client clock so the buffer hovers around its target instead of draining to zero (a stall)
 * or piling up (extra latency).
 */
export function pacingScale(buffered: number, target = CLIENT_BUFFER_TARGET): number {
  if (buffered > target + 3) return 1.1;
  if (buffered > target + 1) return 1.03;
  if (buffered < target - 1) return 0.97;
  return 1;
}

export type OnlineMatch = {
  role: OnlineRole;
  /** The fighter this browser steers, or -1 when watching from the lobby. */
  localSlot: number;
  slots: MatchSlot[];
  names: string[];
  /** Host: inputs from remote fighters. */
  remote: RemoteInputs;
  /** Host: frames stepped this render frame, flushed as one message. */
  outbox: PackedInput[][];
  outboxStart: number;
  /** Client: authoritative frames not yet stepped. */
  inbox: PlayerInput[][];
  /** Client: the tick the next inbox frame belongs to (gap detection). */
  nextTick: number;
  /** Client: hashes the host published, checked as the client reaches each tick. */
  hashes: Map<number, string>;
  lastHashOk: number;
  desync: boolean;
  lastResyncAt: number;
  pendingSnapshot: WorldSnapshot | null;
  /** Client: local input outbound. */
  sender: ReturnType<typeof createInputSender> | null;
  /** Client: the host did not step for a while (its tab is hidden, or the link is bad). */
  stalledSince: number;
};

export function createOnlineMatch(
  role: OnlineRole,
  slots: MatchSlot[],
  myPeerId: number,
  sendInput: (p: PackedInput) => void,
): OnlineMatch {
  return {
    role,
    localSlot: slots.findIndex((s) => s.peer === myPeerId),
    slots,
    names: slots.map((s) => s.name),
    remote: createRemoteInputs(slots.length),
    outbox: [],
    outboxStart: 0,
    inbox: [],
    nextTick: 0,
    hashes: new Map(),
    lastHashOk: 0,
    desync: false,
    lastResyncAt: 0,
    pendingSnapshot: null,
    sender: role === 'client' ? createInputSender(sendInput) : null,
    stalledSince: 0,
  };
}

/** Client: file a batch of authoritative frames; returns false if the stream skipped ticks. */
export function acceptFrames(
  match: OnlineMatch,
  start: number,
  frames: PackedInput[][],
  hash?: { tick: number; h: string },
): boolean {
  let ok = true;
  if (match.nextTick !== start) {
    // The stream is reliable and ordered, so a gap means we missed the match start or a resync.
    ok = false;
  }
  for (const frame of frames) match.inbox.push(frame.map(unpackInput));
  match.nextTick = start + frames.length;
  if (hash) match.hashes.set(hash.tick, hash.h);
  return ok;
}

/** Client: compare the world after stepping `tick`; returns null when there was nothing to check. */
export function checkHash(match: OnlineMatch, tick: number, hashNow: () => string): boolean | null {
  const expected = match.hashes.get(tick);
  // Anything older than this tick can never be checked again.
  for (const t of match.hashes.keys()) if (t <= tick) match.hashes.delete(t);
  if (expected === undefined) return null;
  const ok = hashNow() === expected;
  if (ok) match.lastHashOk = tick;
  return ok;
}
