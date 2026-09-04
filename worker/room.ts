import { DurableObject } from 'cloudflare:workers';
import {
  MAX_MESSAGE_CHARS,
  MAX_PEERS,
  cleanPeerName,
  type PeerInfo,
  type RelayErrorCode,
  type RelayFromPeer,
  type RelayToPeer,
} from '../src/net/relay';
import { relayPoint } from '../src/telemetry/points';

/** What we remember about a socket; survives hibernation via `serializeAttachment`. */
type Attachment = {
  id: number;
  name: string;
  role: 'host' | 'client';
  /**
   * Statistics only (docs/telemetry.md): when this socket connected, from where, and which hosting of
   * the room it belongs to. Optional because a socket attached by an older build may still be around.
   */
  since?: number;
  country?: string;
  colo?: string;
  room?: string;
};

/**
 * One Durable Object per room code. It is a dumb relay: the browser that hosts runs the game and is
 * the only peer allowed to broadcast; clients can only talk to the host. Nothing is persisted — a room
 * is exactly the set of sockets attached to it, and it ends when the host disconnects.
 */
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Latency probes are answered at the edge without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role: Attachment['role'] = url.searchParams.get('role') === 'host' ? 'host' : 'client';
    const name = cleanPeerName(url.searchParams.get('name'));
    const peers = this.attachments();
    const host = peers.find((p) => p.role === 'host');
    const country = request.headers.get('x-geo-country') || 'XX';
    const colo = request.headers.get('x-geo-colo') || '';

    let refused: RelayErrorCode | null = null;
    if (role === 'host' && host) refused = 'room-taken';
    else if (role === 'client' && !host) refused = 'no-such-room';
    else if (peers.length >= MAX_PEERS) refused = 'room-full';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    if (refused) {
      // Accept just long enough to say why, so the browser gets a readable reason instead of a bare
      // connection error, then close with an application code.
      server.accept();
      server.send(JSON.stringify({ t: 'error', code: refused } satisfies RelayToPeer));
      server.close(4000, refused);
      this.record({ event: 'refuse', role, reason: refused, country, colo, peers: peers.length, seconds: 0, room: host?.room ?? 'none' });
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = peers.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    // A room code gets reused; the instance id ties one hosting's open/join/leave/close rows together.
    const roomInstance = host?.room ?? crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ id, name, role, since: Date.now(), country, colo, room: roomInstance } satisfies Attachment);
    this.ctx.acceptWebSocket(server);
    this.record({ event: role === 'host' ? 'open' : 'join', role, reason: '', country, colo, peers: peers.length + 1, seconds: 0, room: roomInstance });

    const welcome: RelayToPeer = {
      t: 'welcome',
      id,
      hostId: host?.id ?? id,
      peers: [...peers.map(info), { id, name }],
    };
    server.send(JSON.stringify(welcome));
    this.broadcast(JSON.stringify({ t: 'peer', peer: { id, name } } satisfies RelayToPeer), id);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_CHARS) return;
    const me = attachmentOf(ws);
    if (!me) return;
    let envelope: RelayFromPeer;
    try {
      envelope = JSON.parse(message) as RelayFromPeer;
    } catch {
      return;
    }
    if (!envelope || envelope.t !== 'to' || !('m' in envelope)) return;
    const out = JSON.stringify({ t: 'from', from: me.id, m: envelope.m } satisfies RelayToPeer);
    if (me.role === 'host') {
      if (envelope.to === 'all') this.broadcast(out, me.id);
      else if (typeof envelope.to === 'number') send(this.socketOf(envelope.to), out);
      return;
    }
    // Clients only ever reach the host; anything else is dropped.
    if (envelope.to !== 'host') return;
    send(this.hostSocket(), out);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.drop(ws, String(code));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws, 'error');
  }

  /** `why` is the WebSocket close code (1000/1001 = the browser hung up on purpose, 1006 = it vanished) or `error`. */
  private drop(ws: WebSocket, why: string): void {
    const me = attachmentOf(ws);
    try {
      ws.close(1000, 'bye');
    } catch {
      // Already closed by the other side.
    }
    if (!me) return;
    const remaining = this.ctx.getWebSockets().filter((other) => other !== ws).length;
    this.record({
      event: me.role === 'host' ? 'close' : 'leave',
      role: me.role,
      reason: why,
      country: me.country ?? 'XX',
      colo: me.colo ?? '',
      peers: me.role === 'host' ? 0 : remaining,
      seconds: me.since ? Math.round((Date.now() - me.since) / 1000) : 0,
      room: me.room ?? 'none',
    });
    if (me.role === 'host') {
      // The room lives and dies with its host: tell everyone and hang up.
      const closed = JSON.stringify({ t: 'closed', reason: 'host-left' } satisfies RelayToPeer);
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        send(other, closed);
        try {
          other.close(4001, 'host-left');
        } catch {
          // Already gone.
        }
      }
      return;
    }
    this.broadcast(JSON.stringify({ t: 'left', id: me.id } satisfies RelayToPeer), me.id);
  }

  private attachments(): Attachment[] {
    const out: Attachment[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachmentOf(ws);
      if (a) out.push(a);
    }
    return out.sort((a, b) => a.id - b.id);
  }

  private socketOf(id: number): WebSocket | undefined {
    return this.ctx.getWebSockets().find((ws) => attachmentOf(ws)?.id === id);
  }

  private hostSocket(): WebSocket | undefined {
    return this.ctx.getWebSockets().find((ws) => attachmentOf(ws)?.role === 'host');
  }

  private broadcast(raw: string, exceptId: number): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (attachmentOf(ws)?.id === exceptId) continue;
      send(ws, raw);
    }
  }

  /** One row in the relay statistics dataset; never anything a peer typed (names stay in the room). */
  private record(p: {
    event: 'open' | 'join' | 'refuse' | 'leave' | 'close';
    role: Attachment['role'];
    reason: string;
    country: string;
    colo: string;
    peers: number;
    seconds: number;
    room: string;
  }): void {
    try {
      this.env.RELAY.writeDataPoint(
        relayPoint({
          environment: String(this.env.ENVIRONMENT),
          country: p.country,
          event: p.event,
          role: p.role,
          reason: p.reason,
          colo: p.colo,
          peers: p.peers,
          seconds: p.seconds,
          roomInstance: p.room,
        }),
      );
    } catch {
      // Statistics never get in the way of the relay (e.g. the binding is missing in a local run).
    }
  }
}

function attachmentOf(ws: WebSocket): Attachment | null {
  const a = ws.deserializeAttachment() as Attachment | null | undefined;
  return a && typeof a.id === 'number' ? a : null;
}

function info(a: Attachment): PeerInfo {
  return { id: a.id, name: a.name };
}

function send(ws: WebSocket | undefined, raw: string): void {
  if (!ws) return;
  try {
    ws.send(raw);
  } catch {
    // A socket that is closing; its close handler cleans up.
  }
}
