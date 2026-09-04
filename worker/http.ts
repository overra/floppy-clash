/** Small HTTP helpers shared by the Worker's routes. */

/** The Worker only serves the game it ships with (plus local dev servers proxying to it). */
export function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    return o.host === url.host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Read a request body of at most `maxBytes`, or return null once it runs past that. Bodies are
 * streamed so a hostile client cannot make the Worker buffer an unbounded payload before it is rejected.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return null;
  const body = request.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(joined);
}

/** `request.cf` fields are typed loosely once a request has crossed into a Durable Object. */
export function cfString(request: Request, key: 'country' | 'colo'): string {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
  const v = cf?.[key];
  return typeof v === 'string' ? v : '';
}

/** Constant-time comparison for bearer tokens (a plain `===` leaks length and prefix timing). */
export async function secretsMatch(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const a = await crypto.subtle.digest('SHA-256', enc.encode(presented));
  const b = await crypto.subtle.digest('SHA-256', enc.encode(expected));
  return crypto.subtle.timingSafeEqual(a, b);
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ ok: false, error, ...extra }, { status, headers: { 'cache-control': 'no-store' } });
}
