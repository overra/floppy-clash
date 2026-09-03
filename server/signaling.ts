import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

type RoomClient = { ws: WebSocket; id: string; role: 'host' | 'client' };

type Room = {
  clients: Map<string, RoomClient>;
  lastSdp?: string;
  ice: string[];
  hostId?: string;
};

export type SignalingHandle = {
  port: number;
  close: () => Promise<void>;
};

function nid(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function startSignaling(port = Number(process.env.PORT ?? 8787)): Promise<SignalingHandle> {
  const rooms = new Map<string, Room>();
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('floppy-clash signaling\n');
  });
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    let roomId = '';
    let selfId = '';
    ws.on('message', (raw) => {
      let msg: { t?: string; code?: string; role?: string; to?: string };
      try {
        msg = JSON.parse(String(raw)) as { t?: string; code?: string; role?: string; to?: string };
      } catch {
        return;
      }
      if (msg.t === 'room' && msg.code) {
        roomId = msg.code.toUpperCase();
        selfId = nid();
        const room: Room = rooms.get(roomId) ?? { clients: new Map(), ice: [] };
        const role = msg.role === 'host' ? 'host' : 'client';
        room.clients.set(selfId, { ws, id: selfId, role });
        if (role === 'host') room.hostId = selfId;
        rooms.set(roomId, room);
        ws.send(JSON.stringify({ t: 'you', id: selfId }));

        const notifyHost = (clientId: string) => {
          if (!room.hostId || clientId === room.hostId) return;
          const host = room.clients.get(room.hostId);
          if (host && host.ws.readyState === host.ws.OPEN) {
            host.ws.send(JSON.stringify({ t: 'peer-join', id: clientId }));
          }
        };

        if (role === 'host') {
          for (const id of room.clients.keys()) notifyHost(id);
        } else {
          notifyHost(selfId);
          if (room.lastSdp && !room.hostId) ws.send(room.lastSdp);
          for (const ice of room.ice) {
            if (!room.hostId) ws.send(ice);
          }
        }

        const peers = JSON.stringify({ t: 'peers', n: room.clients.size });
        for (const c of room.clients.values()) {
          if (c.ws.readyState === c.ws.OPEN) c.ws.send(peers);
        }
        return;
      }
      const room = rooms.get(roomId);
      if (!room) return;
      const payload = String(raw);
      if (msg.t === 'sdp' && !msg.to) room.lastSdp = payload;
      if (msg.t === 'ice' && !msg.to) {
        room.ice.push(payload);
        if (room.ice.length > 24) room.ice.shift();
      }
      if (msg.to) {
        const target = room.clients.get(msg.to);
        if (target && target.ws.readyState === target.ws.OPEN) {
          let out = payload;
          try {
            const o = JSON.parse(payload) as Record<string, unknown>;
            o.from = selfId;
            out = JSON.stringify(o);
          } catch {
            /* keep */
          }
          target.ws.send(out);
        }
        return;
      }
      for (const c of room.clients.values()) {
        if (c.ws !== ws && c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
      }
    });
    ws.on('close', () => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.clients.delete(selfId);
      if (room.hostId === selfId) room.hostId = undefined;
      if (room.clients.size === 0) rooms.delete(roomId);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const bound = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: bound,
        close: () => closeSignaling(wss, server),
      });
    });
  });
}

function closeSignaling(wss: WebSocketServer, server: Server): Promise<void> {
  return new Promise((resolve) => {
    for (const client of wss.clients) client.close();
    wss.close();
    server.close(() => resolve());
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void startSignaling().then((h) => {
    console.log(`signaling on :${h.port}`);
  });
}
