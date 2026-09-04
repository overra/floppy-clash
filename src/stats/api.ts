import type { StatsRange, StatsResponse } from '../telemetry/stats';

/**
 * The dashboard's one data source: `GET /api/stats` on the same origin, unlocked with the shared
 * STATS_KEY. The key lives in sessionStorage — it is gone when the tab closes, and it never appears in
 * a URL.
 */

const KEY_STORAGE = 'floppy-clash.stats-key';

export function loadKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function saveKey(key: string): void {
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode without storage: the key just has to be typed again next time.
  }
}

export class StatsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly missing: string[] = [],
  ) {
    super(message);
  }
}

export async function fetchStats(range: StatsRange, key: string, env?: string): Promise<StatsResponse> {
  const params = new URLSearchParams({ range });
  if (env) params.set('env', env);
  const res = await fetch(`/api/stats?${params}`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) {
    let body: { error?: string; message?: string; missing?: string[] } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Not JSON (a proxy error page, say); the status is all we know.
    }
    throw new StatsError(res.status, body.message ? `${body.error}: ${body.message}` : (body.error ?? `HTTP ${res.status}`), body.missing ?? []);
  }
  return (await res.json()) as StatsResponse;
}
