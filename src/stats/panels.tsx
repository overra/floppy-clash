import type { CountryRow, DeviceRow, ErrorRow, LevelRow, ModeRow, OutcomeRow, PerfGroupRow, RelayRow, StatsResponse } from '../telemetry/stats';
import { ActivityChart, FramePacingChart, LongFramesChart, RoomSizesChart } from './charts';
import { fmtAgo, fmtDuration, fmtInt, fmtMs, fmtNum, fmtPct, titleCase } from './format';
import type { SortableColumn } from './interior/sortable-table';
import { ChartCard, DataTable, Notice, Section, StatCard } from './ui';

/** The four tabs of the dashboard. `data` is undefined while the first response is on its way. */

const desc = (columnId: string) => ({ columnId, direction: 'desc' as const });
const num = <T,>(id: string, header: string, value: (r: T) => number, cell?: (r: T) => string, width = '92px'): SortableColumn<T> => ({
  id,
  header,
  width,
  align: 'end',
  numeric: true,
  value,
  cell: cell ? (r) => cell(r) : (r) => fmtInt(value(r)),
});

const MODE_LABEL: Record<string, string> = { local: 'Couch', solo: 'Solo vs bots', online: 'Online' };
// The wire format keeps these lowercase (src/telemetry/device.ts); people expect the brand spelling.
const OS_LABEL: Record<string, string> = { ios: 'iOS', macos: 'macOS', windows: 'Windows', android: 'Android', linux: 'Linux', chromeos: 'ChromeOS', other: 'Other' };
const BROWSER_LABEL: Record<string, string> = { chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', opera: 'Opera', other: 'Other' };
const RENDERER_LABEL: Record<string, string> = { gpu: 'WebGPU', canvas: 'Canvas 2D' };
const labelled = (map: Record<string, string>) => (value: string) => map[value] ?? titleCase(value);
const OUTCOME_LABEL: Record<string, string> = {
  finished: 'Finished',
  quit: 'Quit',
  'host-ended': 'Host ended',
  left: 'Left',
  disconnected: 'Disconnected',
  restarted: 'Restarted',
  unload: 'Tab closed',
  unknown: 'Unknown',
};

const modeColumns: SortableColumn<ModeRow>[] = [
  { id: 'mode', header: 'Mode', value: (r) => MODE_LABEL[r.mode] ?? titleCase(r.mode), width: 'minmax(140px, 1fr)' },
  num('started', 'Started', (r) => r.started),
  num('ended', 'Ended', (r) => r.ended),
  num('avgSeconds', 'Length', (r) => r.avgSeconds, (r) => fmtDuration(r.avgSeconds)),
  num('avgHumans', 'Humans', (r) => r.avgHumans, (r) => fmtNum(r.avgHumans), '92px'),
  num('avgBots', 'Bots', (r) => r.avgBots, (r) => fmtNum(r.avgBots), '80px'),
  num('kills', 'KOs', (r) => r.kills, undefined, '92px'),
];

const outcomeColumns: SortableColumn<OutcomeRow & { share: number }>[] = [
  { id: 'outcome', header: 'How matches ended', value: (r) => OUTCOME_LABEL[r.outcome] ?? titleCase(r.outcome) },
  num('count', 'Matches', (r) => r.count),
  num('share', 'Share', (r) => r.share, (r) => fmtPct(r.share), '80px'),
];

const levelColumns: SortableColumn<LevelRow>[] = [
  { id: 'level', header: 'Level', value: (r) => r.level },
  num('started', 'Matches', (r) => r.started),
  num('share', 'Share', (r) => r.share, (r) => fmtPct(r.share), '80px'),
];

const deviceColumns: SortableColumn<DeviceRow>[] = [
  { id: 'device', header: 'Device', value: (r) => titleCase(r.device), width: '100px' },
  { id: 'os', header: 'OS', value: (r) => labelled(OS_LABEL)(r.os) },
  { id: 'browser', header: 'Browser', value: (r) => labelled(BROWSER_LABEL)(r.browser) },
  num('sessions', 'Sessions', (r) => r.sessions),
];

const countryColumns: SortableColumn<CountryRow>[] = [
  { id: 'country', header: 'Country', value: (r) => r.country || 'XX' },
  num('sessions', 'Sessions', (r) => r.sessions),
];

export function UsagePanel({ data }: { data: StatsResponse | undefined }) {
  const outcomesTotal = data?.outcomes.reduce((acc, r) => acc + r.count, 0) ?? 0;
  const outcomes = data?.outcomes.map((r) => ({ ...r, share: outcomesTotal ? r.count / outcomesTotal : 0 }));
  return (
    <div className="grid gap-5">
      <ChartCard title="Activity" hint="Page loads and matches started, per bucket">
        <ActivityChart rows={data?.timeline ?? []} bucketSeconds={data?.bucketSeconds ?? 3600} />
      </ChartCard>
      <Section title="Modes" hint="Online counted once per match, not per player; Length, Humans and Bots are per-match averages">
        <DataTable rows={data?.modes} columns={modeColumns} getRowId={(r) => r.mode} label="Matches by mode" defaultSort={desc('started')} minWidth={640} />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Outcomes" hint="Every participant's copy of a match reports how it ended">
          <DataTable rows={outcomes} columns={outcomeColumns} getRowId={(r) => r.outcome} label="Match outcomes" defaultSort={desc('count')} />
        </Section>
        <Section title="Levels" hint="Editor levels are all `custom`">
          <DataTable rows={data?.levels} columns={levelColumns} getRowId={(r) => r.level} label="Matches by level" defaultSort={desc('started')} />
        </Section>
        <Section title="Devices">
          <DataTable rows={data?.devices} columns={deviceColumns} getRowId={(r) => `${r.device}/${r.os}/${r.browser}`} label="Sessions by device" defaultSort={desc('sessions')} />
        </Section>
        <Section title="Countries" hint="From the request's edge location; no IP is stored">
          <DataTable rows={data?.countries} columns={countryColumns} getRowId={(r) => r.country || 'XX'} label="Sessions by country" defaultSort={desc('sessions')} />
        </Section>
      </div>
    </div>
  );
}

const perfColumns = (group: [string, (v: string) => string], sub: [string, (v: string) => string]): SortableColumn<PerfGroupRow>[] => [
  { id: 'group', header: group[0], value: (r) => group[1](r.group), width: '120px' },
  { id: 'sub', header: sub[0], value: (r) => sub[1](r.sub), width: '100px' },
  num('minutes', 'Minutes', (r) => r.minutes, (r) => fmtInt(r.minutes), '84px'),
  num('p50', 'p50', (r) => r.p50, (r) => fmtMs(r.p50), '84px'),
  num('p95', 'p95', (r) => r.p95, (r) => fmtMs(r.p95), '84px'),
  num('p99', 'p99', (r) => r.p99, (r) => fmtMs(r.p99), '84px'),
  num('long20PerMin', '>20 ms', (r) => r.long20PerMin, (r) => fmtNum(r.long20PerMin), '84px'),
  num('long50PerMin', '>50 ms', (r) => r.long50PerMin, (r) => fmtNum(r.long50PerMin, 2), '84px'),
  num('sim', 'Sim', (r) => r.sim, (r) => fmtMs(r.sim), '84px'),
  num('build', 'Build', (r) => r.build, (r) => fmtMs(r.build), '84px'),
  num('render', 'Render', (r) => r.render, (r) => fmtMs(r.render), '84px'),
  num('gpu', 'GPU', (r) => r.gpu, (r) => fmtMs(r.gpu), '84px'),
  num('resScale', 'Res', (r) => r.resScale, (r) => (r.resScale ? `${Math.round(r.resScale * 100)}%` : '—'), '64px'),
];
const rendererColumns = perfColumns(['Renderer', labelled(RENDERER_LABEL)], ['Device', titleCase]);
const browserColumns = perfColumns(['Browser', labelled(BROWSER_LABEL)], ['OS', labelled(OS_LABEL)]);

export function PerfPanel({ data }: { data: StatsResponse | undefined }) {
  const bucket = data?.bucketSeconds ?? 3600;
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Frame pacing" hint="Median of each minute's p50 / p95 / p99 frame interval; 16.7 ms is 60 Hz">
          <FramePacingChart rows={data?.perfTimeline ?? []} bucketSeconds={bucket} />
        </ChartCard>
        <ChartCard title="Long frames" hint="Frames over 20 ms per minute of play (a visible hitch at 60 Hz)">
          <LongFramesChart rows={data?.perfTimeline ?? []} bucketSeconds={bucket} />
        </ChartCard>
      </div>
      <Section title="By renderer and device" hint=">20 ms and >50 ms are long frames per minute of play; stage columns are mean ms per frame; Res is the resolution scale the GPU renderer settled on">
        <DataTable rows={data?.perfByRenderer} columns={rendererColumns} getRowId={(r) => `${r.group}/${r.sub}`} label="Frame pacing by renderer and device" defaultSort={desc('minutes')} minWidth={1140} />
      </Section>
      <Section title="By browser and OS">
        <DataTable rows={data?.perfByBrowser} columns={browserColumns} getRowId={(r) => `${r.group}/${r.sub}`} label="Frame pacing by browser and OS" defaultSort={desc('minutes')} minWidth={1140} />
      </Section>
      <Notice>
        Each perf row the game sends summarises about a minute of play: rAF-interval percentiles from a fixed histogram, long-frame counts, and mean stage cost from the F3 profiler. Percentiles here are the
        median across those rows, weighted by Analytics Engine&apos;s sampling — a &quot;typical minute&quot;, not a global percentile.
      </Notice>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = { open: 'Room opened', join: 'Player joined', refuse: 'Refused', leave: 'Player left', close: 'Room closed' };
const REASON_LABEL: Record<string, string> = {
  '': '—',
  '1000': 'left cleanly',
  '1001': 'page closed',
  '1005': 'no status',
  '1006': 'connection dropped',
  '1011': 'server error',
  '4001': 'host left',
  error: 'socket error',
  'room-taken': 'code already hosting',
  'no-such-room': 'no such room',
  'room-full': 'room full',
};

const relayColumns: SortableColumn<RelayRow>[] = [
  { id: 'event', header: 'Event', value: (r) => EVENT_LABEL[r.event] ?? titleCase(r.event), width: '140px' },
  { id: 'reason', header: 'Reason', value: (r) => REASON_LABEL[r.reason] ?? r.reason },
  num('count', 'Count', (r) => r.count),
  num('avgSeconds', 'Connected', (r) => r.avgSeconds, (r) => fmtDuration(r.avgSeconds), '104px'),
];

export function OnlinePanel({ data }: { data: StatsResponse | undefined }) {
  const relay = data?.relay ?? [];
  const sum = (event: string) => relay.filter((r) => r.event === event).reduce((acc, r) => acc + r.count, 0);
  const closes = relay.filter((r) => r.event === 'close');
  const closeCount = closes.reduce((acc, r) => acc + r.count, 0);
  const avgRoomSeconds = closeCount ? closes.reduce((acc, r) => acc + r.avgSeconds * r.count, 0) / closeCount : 0;
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Rooms opened" value={sum('open')} hint={`avg lifetime ${fmtDuration(avgRoomSeconds)}`} />
        <StatCard label="Players joined" value={sum('join')} hint={`${fmtInt(sum('refuse'))} refused`} />
        <StatCard label="Relay RTT p50" value={data?.online.rttP50 ?? 0} format={fmtMs} hint={`p95 ${fmtMs(data?.online.rttP95 ?? 0)}`} />
        <StatCard label="Resyncs" value={data?.online.desyncs ?? 0} hint={`over ${fmtInt(data?.online.minutes ?? 0)} online minutes`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ChartCard title="Room sizes" hint="Rooms that reached each player count">
          <RoomSizesChart rows={data?.roomSizes ?? []} />
        </ChartCard>
        <Section title="Relay events" hint="As the Durable Object saw them; Connected is the mean time on the socket before leaving">
          <DataTable rows={data?.relay} columns={relayColumns} getRowId={(r) => `${r.event}/${r.reason}`} label="Relay events" defaultSort={desc('count')} minWidth={520} />
        </Section>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  js: 'Script error',
  rejection: 'Unhandled rejection',
  frame: 'Frame error',
  'gpu-fallback': 'WebGPU fallback',
  desync: 'Desync',
  room: 'Room refused',
};

const errorColumns: SortableColumn<ErrorRow>[] = [
  { id: 'kind', header: 'Kind', value: (r) => KIND_LABEL[r.kind] ?? titleCase(r.kind), width: '150px' },
  { id: 'message', header: 'Message', value: (r) => r.message, width: 'minmax(0, 3fr)', cell: (r) => <span title={r.message}>{r.message}</span> },
  { id: 'source', header: 'Source', value: (r) => r.source, width: 'minmax(0, 2fr)', cell: (r) => <span title={r.source}>{r.source || '—'}</span> },
  num('count', 'Count', (r) => r.count, undefined, '80px'),
  { id: 'lastSeen', header: 'Last seen', value: (r) => r.lastSeen, width: '100px', align: 'end', cell: (r) => fmtAgo(r.lastSeen) },
];

export function ErrorsPanel({ data }: { data: StatsResponse | undefined }) {
  return (
    <div className="grid gap-5">
      <Section title="Errors" hint="Grouped by message; each session reports a message once">
        <DataTable rows={data?.errors} columns={errorColumns} getRowId={(r) => `${r.kind}|${r.message}|${r.source}`} label="Errors" defaultSort={desc('count')} visibleRows={14} minWidth={880} />
      </Section>
      <Notice>
        <strong className="text-stone-100">WebGPU fallback</strong> rows are not bugs: the browser had no usable WebGPU and the Canvas renderer took over. <strong className="text-stone-100">Desync</strong>{' '}
        rows mean an online client asked the host for a snapshot; a handful per match is a network blip, a steady stream is a determinism bug.
      </Notice>
    </div>
  );
}
