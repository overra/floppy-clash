import {
  MAX_EVENTS_PER_BATCH,
  TELEMETRY_VERSION,
  type DeviceInfo,
  type ErrorEvent,
  type MatchEvent,
  type PageEvent,
  type PerfEvent,
  type RendererKind,
  type TelemetryBatch,
  type TelemetryContext,
  type TelemetryEvent,
} from './schema';

/**
 * The browser side of telemetry: a queue of events that is posted to `/api/telemetry` in small
 * batches — when it fills up, every half minute, and when the tab is hidden or closed
 * (`sendBeacon`, so the last batch survives navigation). Nothing here is ever awaited by the game:
 * a failed post is dropped, never retried, never logged to the player.
 *
 * Off means off: with `enabled` false nothing is queued, and turning it off drops what is queued.
 */

export type Telemetry = {
  readonly enabled: boolean;
  /** Random per page load, never persisted. */
  readonly sessionId: string;
  setEnabled(on: boolean): void;
  page(e: Omit<PageEvent, 'k'>): void;
  match(e: Omit<MatchEvent, 'k'>): void;
  perf(e: Omit<PerfEvent, 'k'>): void;
  error(e: Omit<ErrorEvent, 'k'>): void;
  /** Post whatever is queued now. */
  flush(): void;
  /** Runs just before the final flush when the page is being left (close open matches, etc.). */
  onPageHide(fn: () => void): void;
  /** Events queued but not yet posted (tests and the console). */
  readonly pending: number;
  destroy(): void;
};

export type Transport = (endpoint: string, body: string) => void;

export type TelemetryOptions = {
  enabled: boolean;
  ctx: DeviceInfo;
  /** What the game is doing right now, stamped onto script errors. */
  context?: () => { context: TelemetryContext; renderer: RendererKind };
  endpoint?: string;
  transport?: Transport;
  /** Post once this many events are queued (≤ MAX_EVENTS_PER_BATCH). */
  batchSize?: number;
  /** ...or this many ms after the first queued event. */
  flushAfterMs?: number;
  /** Script errors reported per page load; the rest are dropped (a broken frame loop shouts every frame). */
  maxErrors?: number;
  /** Hook window/document events (off in tests). */
  listen?: boolean;
  sessionId?: string;
};

export const TELEMETRY_ENDPOINT = '/api/telemetry';

export function createTelemetry(opts: TelemetryOptions): Telemetry {
  const endpoint = opts.endpoint ?? TELEMETRY_ENDPOINT;
  const transport = opts.transport ?? defaultTransport;
  const batchSize = Math.min(MAX_EVENTS_PER_BATCH, Math.max(1, opts.batchSize ?? 20));
  const flushAfterMs = opts.flushAfterMs ?? 30_000;
  const maxErrors = opts.maxErrors ?? 10;
  const sessionId = opts.sessionId ?? randomSessionId();
  let enabled = opts.enabled;
  let queue: TelemetryEvent[] = [];
  let timer = 0;
  let errors = 0;
  const seenErrors = new Set<string>();
  const hideHooks: (() => void)[] = [];

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    if (!queue.length) return;
    const events = queue;
    queue = [];
    // A batch never exceeds what the Worker accepts; a burst just becomes several posts.
    for (let i = 0; i < events.length; i += MAX_EVENTS_PER_BATCH) {
      const batch: TelemetryBatch = { v: TELEMETRY_VERSION, sid: sessionId, ctx: opts.ctx, events: events.slice(i, i + MAX_EVENTS_PER_BATCH) };
      try {
        transport(endpoint, JSON.stringify(batch));
      } catch {
        // Telemetry must never surface to the player.
      }
    }
  };

  const push = (e: TelemetryEvent) => {
    if (!enabled) return;
    queue.push(e);
    if (queue.length >= batchSize) flush();
    else if (!timer) timer = setTimeout(flush, flushAfterMs) as unknown as number;
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  const onHide = () => {
    for (const fn of hideHooks) {
      try {
        fn();
      } catch {
        // Nothing a hook does may keep the last batch from going out.
      }
    }
    flush();
  };
  const onError = (ev: Event) => {
    const e = ev as globalThis.ErrorEvent;
    report('js', e.message || 'Script error', `${e.filename ?? ''}:${e.lineno ?? 0}:${e.colno ?? 0}`);
  };
  const onRejection = (ev: Event) => {
    const reason = (ev as PromiseRejectionEvent).reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const source = reason instanceof Error ? firstFrame(reason.stack) : '';
    report('rejection', message, source);
  };

  function report(kind: 'js' | 'rejection', message: string, source: string) {
    if (!enabled || errors >= maxErrors) return;
    const key = `${kind}:${message}`;
    if (seenErrors.has(key)) return;
    seenErrors.add(key);
    errors += 1;
    const where = opts.context?.() ?? { context: 'menu' as const, renderer: 'canvas' as const };
    push({ k: 'error', kind, message: clip(message, 300), source: clip(source, 160), ...where });
  }

  const listening = opts.listen ?? typeof window !== 'undefined';
  if (listening) {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
  }

  return {
    get enabled() {
      return enabled;
    },
    sessionId,
    get pending() {
      return queue.length;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        queue = [];
        if (timer) {
          clearTimeout(timer);
          timer = 0;
        }
      }
    },
    page: (e) => push({ k: 'page', ...e }),
    match: (e) => push({ k: 'match', ...e }),
    perf: (e) => push({ k: 'perf', ...e }),
    error: (e) => push({ k: 'error', ...e, message: clip(e.message, 300), source: clip(e.source, 160) }),
    flush,
    onPageHide: (fn) => {
      hideHooks.push(fn);
    },
    destroy() {
      flush();
      if (listening) {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onHide);
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      }
    },
  };
}

/**
 * `sendBeacon` is the right tool: it survives the page unloading and never blocks the frame loop.
 * It can refuse (queue full) — then a keepalive fetch takes over, and if that fails the batch is lost,
 * which is fine for statistics.
 */
export const defaultTransport: Transport = (endpoint, body) => {
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(endpoint, body)) return;
    } catch {
      // Fall through to fetch.
    }
  }
  if (typeof fetch === 'function') {
    void fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => undefined);
  }
};

/**
 * Global Privacy Control is a browser-level "do not share my data" signal. Anonymous first-party
 * statistics are arguably outside its scope, but honouring it costs nothing and is the polite reading.
 */
export function privacySignalOptOut(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

function randomSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  let s = '';
  while (s.length < 16) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function firstFrame(stack: string | undefined): string {
  if (!stack) return '';
  const line = stack.split('\n').find((l) => /\.[jt]s/.test(l)) ?? '';
  return line.trim();
}
