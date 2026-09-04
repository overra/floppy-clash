import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATS_RANGES, isStatsRange, type StatsRange, type StatsResponse } from '../telemetry/stats';
import { StatsError, fetchStats, loadKey, saveKey } from './api';
import { fmtAgo, fmtHours, fmtInt } from './format';
import { LoadingButton } from './interior/loading-button';
import { SegmentedControl } from './interior/segmented-control';
import { Tabs } from './interior/tabs';
import { ErrorsPanel, OnlinePanel, PerfPanel, UsagePanel } from './panels';
import { Code, Notice, StatCard } from './ui';

/**
 * /stats — who plays Floppy Clash and how well it runs for them, from the anonymous telemetry the game
 * sends (docs/telemetry.md). One shared key unlocks it; the Worker does the querying.
 */

const RANGE_LABEL: Record<StatsRange, string> = { '1h': 'Last hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
const REFRESH_MS = 60_000;

export function App() {
  const [key, setKey] = useState(loadKey);
  if (!key) return <KeyGate onUnlock={setKey} />;
  return <Dashboard key={key} statsKey={key} onLock={() => setKey('')} />;
}

function Dashboard({ statsKey, onLock }: { statsKey: string; onLock: () => void }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const env = params.get('env') ?? undefined;
  const initialRange = params.get('range') ?? '24h';
  const [range, setRange] = useState<StatsRange>(isStatsRange(initialRange) ? initialRange : '24h');
  const [data, setData] = useState<StatsResponse | undefined>();
  const [error, setError] = useState<StatsError | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [, setClock] = useState(0);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    try {
      const next = await fetchStats(range, statsKey, env);
      if (controller.signal.aborted) return;
      setData(next);
      setError(null);
      setFetchedAt(Date.now());
    } catch (err) {
      if (controller.signal.aborted) return;
      const e = err instanceof StatsError ? err : new StatsError(0, err instanceof Error ? err.message : String(err));
      setError(e);
      if (e.status === 401) {
        saveKey('');
        onLock();
      }
      throw e;
    }
  }, [range, statsKey, env, onLock]);

  useEffect(() => {
    void load().catch(() => undefined);
    return () => inflight.current?.abort();
  }, [load]);

  // Keep the numbers moving while the tab is open; a hidden tab waits for its next visit.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load().catch(() => undefined);
    }, REFRESH_MS);
    const clock = setInterval(() => setClock((c) => c + 1), 10_000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('range', range);
    history.replaceState(null, '', url);
  }, [range]);

  const totals = data?.totals;
  const errorCount = data?.errors.reduce((acc, r) => acc + r.count, 0) ?? 0;
  const tabs = useMemo(
    () => [
      { value: 'usage', label: 'Usage' },
      { value: 'perf', label: 'Performance' },
      { value: 'online', label: 'Online' },
      { value: 'errors', label: errorCount ? `Errors · ${fmtInt(errorCount)}` : 'Errors' },
    ],
    [errorCount],
  );

  return (
    <main className="mx-auto grid max-w-[1400px] gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-stone-100">
            Floppy Clash <span className="text-stone-500">/</span> Stats
          </h1>
          <p className="mt-0.5 text-[12px] text-stone-500">
            {data ? (
              <>
                <span className="rounded-[5px] bg-white/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-stone-300">{data.environment}</span>
                <span className="ml-2">{RANGE_LABEL[range]} · updated {fmtAgo(fetchedAt)}</span>
              </>
            ) : error ? (
              'Could not load'
            ) : (
              'Loading…'
            )}
          </p>
        </div>
        <SegmentedControl label="Time range" options={STATS_RANGES.map((r) => ({ value: r, label: r }))} value={range} onValueChange={(v) => isStatsRange(v) && setRange(v)} />
        <LoadingButton onAction={load} pendingLabel="Refreshing" successLabel="Updated" errorLabel="Failed">
          Refresh
        </LoadingButton>
        <button
          type="button"
          onClick={() => {
            saveKey('');
            onLock();
          }}
          className="h-9 rounded-[9px] px-2.5 text-[13px] text-stone-500 outline-none transition-colors hover:text-stone-200 focus-visible:shadow-[inset_0_0_0_1px_#93B0FF]"
        >
          Lock
        </button>
      </header>

      {error && error.status !== 401 ? <ErrorNotice error={error} /> : null}

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Sessions" value={totals?.sessions ?? 0} hint="page loads" />
        <StatCard label="Players" value={totals?.players ?? 0} hint="sessions that played a match" />
        <StatCard label="Matches" value={totals?.matchesStarted ?? 0} hint={`${fmtInt(totals?.matchesFinished ?? 0)} played to the end`} />
        <StatCard label="Hours played" value={totals?.playSeconds ?? 0} format={fmtHours} hint="summed across browsers" />
        <StatCard label="KOs" value={totals?.kills ?? 0} />
        <StatCard label="Rooms" value={totals?.roomsOpened ?? 0} hint="online rooms opened" />
      </section>

      <Tabs
        items={tabs}
        defaultValue="usage"
        label="Dashboard sections"
        panelClassName="p-4"
        renderPanel={(value) => {
          switch (value) {
            case 'perf':
              return <PerfPanel data={data} />;
            case 'online':
              return <OnlinePanel data={data} />;
            case 'errors':
              return <ErrorsPanel data={data} />;
            default:
              return <UsagePanel data={data} />;
          }
        }}
      />

      <footer className="px-0.5 pb-4 text-[11.5px] leading-relaxed text-stone-600">
        Counts are corrected for Analytics Engine sampling and can shift slightly between refreshes. Add <Code>?env=all</Code> to include preview deployments.
      </footer>
    </main>
  );
}

function ErrorNotice({ error }: { error: StatsError }) {
  if (error.status === 503) {
    return (
      <Notice tone="error">
        <p className="font-medium">The Worker is not configured for stats yet.</p>
        <p className="mt-1">
          Missing:{' '}
          {error.missing.map((m, i) => (
            <span key={m}>
              {i ? ', ' : ''}
              <Code>{m}</Code>
            </span>
          ))}
          . Set each with <Code>npx wrangler secret put NAME</Code> — see <Code>docs/telemetry.md</Code>.
        </p>
      </Notice>
    );
  }
  return (
    <Notice tone="error">
      <span className="font-medium">Could not load stats.</span> {error.message}
      {error.status === 502 ? ' — the Analytics Engine SQL API refused the query; the token may lack Account Analytics: Read.' : ''}
    </Notice>
  );
}

function KeyGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const unlock = async () => {
    const key = draft.trim();
    if (!key) throw new Error('empty');
    try {
      await fetchStats('1h', key);
    } catch (err) {
      // A 503 means the key was accepted but the Worker cannot query yet; let the dashboard explain.
      if (!(err instanceof StatsError && err.status === 503)) throw err;
    }
    saveKey(key);
    onUnlock(key);
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6">
      <h1 className="text-[17px] font-semibold text-stone-100">
        Floppy Clash <span className="text-stone-500">/</span> Stats
      </h1>
      <p className="mt-1 text-[13px] text-stone-400">Enter the stats key for this deployment. It stays in this tab only.</p>
      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage('');
          }}
          aria-label="Stats key"
          placeholder="STATS_KEY"
          className="h-9 min-w-0 flex-1 rounded-[9px] border border-white/[0.16] bg-[#1D1D1A] px-3 font-mono text-[13px] text-stone-100 outline-none placeholder:text-stone-600 focus-visible:border-[#93B0FF]"
        />
        <LoadingButton
          onAction={unlock}
          pendingLabel="Checking"
          successLabel="Unlocked"
          errorLabel="Try again"
          disabled={!draft.trim()}
          onError={(err) => setMessage(err instanceof StatsError && err.status === 401 ? 'That key was not accepted.' : err instanceof Error && err.message !== 'empty' ? err.message : 'Enter the key first.')}
        >
          Unlock
        </LoadingButton>
      </form>
      <p className="mt-3 h-5 text-[12.5px] text-red-300" role="alert">
        {message}
      </p>
    </main>
  );
}
