import type { PlayerInput } from '../sim/input';
import { decodeWire, encodeWire, type NetMessage } from './protocol';

export type LinkOpts = {
  latencyMs: number;
  loss: number;
  rng?: () => number;
};

type Envelope = { deliverAt: number; to: number; msg: NetMessage; bytes: number };

/** In-process delayed/lossy proxy used as the M8 local network-shaping stand-in. */
export function createSimulatedLink(opts: LinkOpts) {
  const rand = opts.rng ?? Math.random;
  let now = 0;
  const inbox: Envelope[] = [];
  let bytesOut = 0;
  let dropped = 0;
  let sent = 0;

  return {
    now: () => now,
    bytesOut: () => bytesOut,
    dropped: () => dropped,
    sent: () => sent,
    advance(ms: number) {
      now += ms;
    },
    send(to: number, msg: NetMessage) {
      sent += 1;
      if (rand() < opts.loss) {
        dropped += 1;
        return;
      }
      const wire = encodeWire(msg);
      const bytes = typeof wire === 'string' ? wire.length : wire.byteLength;
      bytesOut += bytes;
      inbox.push({ deliverAt: now + opts.latencyMs, to, msg: decodeWire(wire), bytes });
    },
    receive(to: number): NetMessage[] {
      const ready: NetMessage[] = [];
      const keep: Envelope[] = [];
      for (const env of inbox) {
        if (env.to === to && env.deliverAt <= now) ready.push(env.msg);
        else keep.push(env);
      }
      inbox.length = 0;
      inbox.push(...keep);
      return ready;
    },
  };
}

export function bundleInputs(history: PlayerInput[]): PlayerInput[] {
  return history.slice(-3);
}

export type RemoteInbox = {
  /** Newest accepted bundle tick; -1 = none yet. Unordered older packets are dropped. */
  tick: number;
  input: PlayerInput | null;
  bundleLen: number;
};

export function emptyRemoteInbox(): RemoteInbox {
  return { tick: -1, input: null, bundleLen: 0 };
}

/**
 * PLAN 4.13: unreliable/unordered channel. Accept a 3-input bundle only when
 * `msgTick` is newer than the last applied tick so a delayed packet cannot
 * clobber a later input. The newest sample in the bundle is the one applied
 * (older entries are the loss-tolerance redundancy).
 */
export function acceptInputBundle(inbox: RemoteInbox, msgTick: number, bundle: PlayerInput[]): RemoteInbox {
  const last = bundle[bundle.length - 1];
  if (!last) return inbox;
  if (inbox.tick >= 0 && msgTick < inbox.tick) return inbox;
  return { tick: msgTick, input: last, bundleLen: bundle.length };
}

/** Host applies the newest input in a loss-tolerant 3-input bundle to a slot. */
export function applyInputBundle(inputs: PlayerInput[], slot: number, bundle: PlayerInput[]): PlayerInput[] {
  const accepted = acceptInputBundle(emptyRemoteInbox(), 0, bundle);
  if (!accepted.input || slot < 0 || slot >= inputs.length) return inputs;
  const next = inputs.slice();
  next[slot] = accepted.input;
  return next;
}

/** Overlay accepted remote seats onto a locally sampled input vector. Seat 0 stays host-local. */
export function applyRemoteInboxes(inputs: PlayerInput[], inboxes: RemoteInbox[]): PlayerInput[] {
  const next = inputs.slice();
  for (let slot = 1; slot < inboxes.length && slot < next.length; slot++) {
    const input = inboxes[slot]?.input;
    if (input) next[slot] = input;
  }
  return next;
}
