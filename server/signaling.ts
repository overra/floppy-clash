import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

type Room = { clients: Set<WebSocket>; lastSdp?: string; ice: string[] };

export type SignalingHandle = {
  port: number;
  close: () => Promise<void>;
};

export function startSignaling(port = Number(process.env.PORT ?? 8787)): Promise<SignalingHandle> {
  const rooms = new Map<string, Room>();
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('floppy-clash signaling\n');
  });
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    let roomId = '';
    ws.on('message', (raw) => {
      let msg: { t?: string; code?: string };
      try {
        msg = JSON.parse(String(raw)) as { t?: string; code?: string };
      } catch {
        return;
      }
      if (msg.t === 'room' && msg.code) {
        roomId = msg.code.toUpperCase();
        const room = rooms.get(roomId) ?? { clients: new Set(), ice: [] };
        room.clients.add(ws);
        rooms.set(roomId, room);
        if (room.lastSdp) ws.send(room.lastSdp);
        for (const ice of room.ice) ws.send(ice);
        const n = room.clients.size;
        const peers = JSON.stringify({ t: 'peers', n });
        for (const peer of room.clients) {
          if (peer.readyState === peer.OPEN) peer.send(peers);
        }
        return;
      }
      const room = rooms.get(roomId);
      if (!room) return;
      const payload = String(raw);
      if (msg.t === 'sdp') room.lastSdp = payload;
      if (msg.t === 'ice') {
        room.ice.push(payload);
        if (room.ice.length > 24) room.ice.shift();
      }
      for (const peer of room.clients) {
        if (peer !== ws && peer.readyState === peer.OPEN) peer.send(payload);
      }
    });
    ws.on('close', () => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.clients.delete(ws);
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
