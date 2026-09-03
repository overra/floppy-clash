import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

type Room = { clients: Set<WebSocket> };
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
      roomId = msg.code;
      const room = rooms.get(roomId) ?? { clients: new Set() };
      room.clients.add(ws);
      rooms.set(roomId, room);
      return;
    }
    const room = rooms.get(roomId);
    if (!room) return;
    for (const peer of room.clients) {
      if (peer !== ws && peer.readyState === peer.OPEN) peer.send(String(raw));
    }
  });
  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.clients.delete(ws);
    if (room.clients.size === 0) rooms.delete(roomId);
  });
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`signaling on :${port}`);
});
