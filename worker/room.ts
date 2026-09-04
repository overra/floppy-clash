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

/** What we remember about a socket; survives hibernation via `serializeAttachment`. */
type Attachment = { id: number; name: string; role: 'host' | 'client' };

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
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = peers.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    server.serializeAttachment({ id, name, role } satisfies Attachment);
    this.ctx.acceptWebSocket(server);

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

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  private drop(ws: WebSocket): void {
    const me = attachmentOf(ws);
    try {
      ws.close(1000, 'bye');
    } catch {
      // Already closed by the other side.
    }
    if (!me) return;
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
