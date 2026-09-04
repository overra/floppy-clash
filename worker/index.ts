import { RoomDO } from './room';
import { isRoomCode } from '../src/net/relay';

export { RoomDO };

const ROOM_PATH = /^\/ws\/room\/([A-Za-z0-9]{4,8})$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const room = ROOM_PATH.exec(url.pathname);
    if (room) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      if (!originAllowed(request, url)) return new Response('Forbidden', { status: 403 });
      const code = room[1]!.toUpperCase();
      if (!isRoomCode(code)) return new Response('Bad room code', { status: 400 });
      // Same code, same object: everyone who types ABCDE lands in the same relay.
      return env.ROOM.getByName(code).fetch(request);
    }
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, environment: env.ENVIRONMENT });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** The relay only serves the game it ships with (plus local dev servers proxying to it). */
function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    return o.host === url.host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
