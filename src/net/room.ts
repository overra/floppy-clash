import { decode, type NetMessage } from './protocol';
import {
  RELAY_ERROR_TEXT,
  type PeerInfo,
  type RelayErrorCode,
  type RelayFromPeer,
  type RelayToPeer,
} from './relay';

export type RoomRole = 'host' | 'client';

export type RoomHandlers = {
  /** A game message from another peer (clients only ever hear from the host). */
  message: (msg: NetMessage, from: number) => void;
  peer: (peer: PeerInfo) => void;
  left: (id: number) => void;
  /** The room ended or the connection dropped; the session is unusable afterwards. */
  closed: (reason: string) => void;
};

export type RoomSession = {
  readonly code: string;
  readonly role: RoomRole;
  /** My peer id in this room. */
  readonly id: number;
  readonly hostId: number;
  /** Everyone in the room, me included, in join order. */
  readonly peers: Map<number, PeerInfo>;
  /** Round trip to the relay edge in ms (0 until the first probe answers). */
  readonly rtt: number;
  readonly bytesOut: number;
  readonly open: boolean;
  send(to: number | 'host' | 'all', msg: NetMessage): void;
  on<K extends keyof RoomHandlers>(event: K, fn: RoomHandlers[K]): void;
  close(): void;
};

export class RoomError extends Error {
  constructor(
    public readonly code: RelayErrorCode | 'timeout' | 'network',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Where the relay lives. Same origin as the page by default (the Worker serves both); the Vite dev
 * server proxies `/ws` to `wrangler dev`, and `VITE_RELAY_ORIGIN` points somewhere else entirely.
 */
export function relayUrl(code: string, role: RoomRole, name: string): string {
  const override = import.meta.env.VITE_RELAY_ORIGIN as string | undefined;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const origin = override || `${proto}//${location.host}`;
  return `${origin}/ws/room/${code}?role=${role}&name=${encodeURIComponent(name)}`;
}

/** The link a player shares: opening it lands on the lobby with the code filled in. */
export function shareUrl(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

const CONNECT_TIMEOUT_MS = 8_000;
const PING_INTERVAL_MS = 2_000;

/** Connect to a room; resolves once the relay has said hello, rejects with a readable reason. */
export function connectRoom(opts: {
  code: string;
  role: RoomRole;
  name: string;
  url?: string;
}): Promise<RoomSession> {
  return new Promise((resolve, reject) => {
    const url = opts.url ?? relayUrl(opts.code, opts.role, opts.name);
    const ws = new WebSocket(url);
    const handlers: { [K in keyof RoomHandlers]: RoomHandlers[K][] } = {
      message: [],
      peer: [],
      left: [],
      closed: [],
    };
    const peers = new Map<number, PeerInfo>();
    let welcomed = false;
    let closedFor: string | null = null;
    let refused: RelayErrorCode | null = null;
    let rtt = 0;
    let pingSentAt = 0;
    let pingTimer = 0;
    let bytesOut = 0;
    let myId = 0;
    let hostId = 0;

    const timeout = window.setTimeout(() => {
      if (welcomed) return;
      ws.close();
      reject(new RoomError('timeout', 'The relay did not answer in time.'));
    }, CONNECT_TIMEOUT_MS);

    const session: RoomSession = {
      code: opts.code,
      role: opts.role,
      get id() {
        return myId;
      },
      get hostId() {
        return hostId;
      },
      peers,
      get rtt() {
        return rtt;
      },
      get bytesOut() {
        return bytesOut;
      },
      get open() {
        return ws.readyState === WebSocket.OPEN && closedFor === null;
      },
      send(to, msg) {
        if (ws.readyState !== WebSocket.OPEN) return;
        const raw = JSON.stringify({ t: 'to', to, m: msg } satisfies RelayFromPeer);
        bytesOut += raw.length;
        ws.send(raw);
      },
      on(event, fn) {
        (handlers[event] as RoomHandlers[typeof event][]).push(fn);
      },
      close() {
        closedFor ??= 'left';
        window.clearInterval(pingTimer);
        ws.close(1000, 'left');
      },
    };

    const finish = (reason: string) => {
      window.clearTimeout(timeout);
      window.clearInterval(pingTimer);
      if (!welcomed) {
        reject(
          refused
            ? new RoomError(refused, RELAY_ERROR_TEXT[refused])
            : new RoomError(
                'network',
                'Could not reach the relay. Check your connection and try again.',
              ),
        );
        return;
      }
      if (closedFor === 'left') return;
      closedFor ??= reason;
      for (const h of handlers.closed) h(closedFor);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      if (ev.data === 'pong') {
        // A measured round trip reads at least 1 ms, so "measured, fast" is not mistaken for "not yet".
        if (pingSentAt) rtt = Math.max(1, Math.round(performance.now() - pingSentAt));
        pingSentAt = 0;
        return;
      }
      let msg: RelayToPeer;
      try {
        msg = JSON.parse(ev.data) as RelayToPeer;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'welcome': {
          welcomed = true;
          window.clearTimeout(timeout);
          myId = msg.id;
          hostId = msg.hostId;
          for (const p of msg.peers) peers.set(p.id, p);
          pingTimer = window.setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN || pingSentAt) return;
            pingSentAt = performance.now();
            ws.send('ping');
          }, PING_INTERVAL_MS);
          resolve(session);
          break;
        }
        case 'peer':
          peers.set(msg.peer.id, msg.peer);
          for (const h of handlers.peer) h(msg.peer);
          break;
        case 'left':
          peers.delete(msg.id);
          for (const h of handlers.left) h(msg.id);
          break;
        case 'closed':
          closedFor ??= msg.reason;
          break;
        case 'error':
          refused = msg.code;
          break;
        case 'from': {
          let game: NetMessage;
          try {
            game = typeof msg.m === 'string' ? decode(msg.m) : (msg.m as NetMessage);
          } catch {
            return;
          }
          for (const h of handlers.message) h(game, msg.from);
          break;
        }
      }
    };
    ws.onerror = () => finish('network');
    ws.onclose = (ev) => finish(ev.reason || 'closed');
  });
}
