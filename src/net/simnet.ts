import type { PlayerInput } from '../sim/input';
import { encode, type NetMessage } from './protocol';

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
      const bytes = encode(msg).length;
      bytesOut += bytes;
      inbox.push({ deliverAt: now + opts.latencyMs, to, msg, bytes });
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
