import { RoomDO } from './room';
import { isRoomCode } from '../src/net/relay';
import { jsonError, originAllowed } from './http';
import { handleStats } from './stats';
import { handleTelemetry } from './telemetry';

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
      // `request.cf` does not travel into the Durable Object, so the two geo fields its statistics
      // use ride along as headers (a browser cannot forge them: the Worker overwrites both).
      const forwarded = new Request(request);
      forwarded.headers.set('x-geo-country', request.cf?.country ?? 'XX');
      forwarded.headers.set('x-geo-colo', request.cf?.colo ?? '');
      // Same code, same object: everyone who types ABCDE lands in the same relay.
      return env.ROOM.getByName(code).fetch(forwarded);
    }
    if (url.pathname === '/api/telemetry') return handleTelemetry(request, env);
    if (url.pathname === '/api/stats') return handleStats(request, env);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, environment: env.ENVIRONMENT });
    }
    if (url.pathname.startsWith('/api/')) return jsonError(404, 'not found');
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
