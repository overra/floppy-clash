import { useMemo } from 'react';
import { barY, defineChart, lineY } from '@tanstack/charts';
import { group } from '@tanstack/charts/group';
import { colorLegend } from '@tanstack/charts/legend';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import type { PerfTimelinePoint, RoomSizeRow, TimelinePoint } from '../telemetry/stats';
import { fmtBucket } from './format';

/**
 * The dashboard's charts, as TanStack Charts definitions. Each takes the already-aggregated rows from
 * /api/stats, folds them into one row per bar/point, and memoizes the definition against the data it
 * captures (the adapter re-renders when the definition identity changes).
 */

// The game's player palette, so the dashboard reads as part of the same product.
const GOLD = '#f2c14e';
const BLUE = '#4c8dff';
const RED = '#e85d4c';
const GREEN = '#3dcf7a';
const HEIGHT = 240;
// Band/point scales draw one candidate label per bucket (up to 30 in a 30-day view); let the axis drop
// the ones that would collide, keeping both ends so the range stays readable.
const TIME_AXIS = { tickLabels: { thin: { minGap: 14, priority: 'ends' as const } } };

type Bar = { label: string; series: string; value: number };
type Point = { label: string; series: string; ms: number };

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center text-[12.5px] text-stone-500" style={{ height: HEIGHT }} role="img" aria-label={`${label}: no data`}>
      No data in this range yet
    </div>
  );
}

/** Sessions and matches per time bucket, side by side. */
export function ActivityChart({ rows, bucketSeconds }: { rows: TimelinePoint[]; bucketSeconds: number }) {
  const bars = useMemo<Bar[]>(
    () =>
      rows.flatMap((r) => {
        const label = fmtBucket(r.t, bucketSeconds);
        return [
          { label, series: 'Sessions', value: r.sessions },
          { label, series: 'Matches', value: r.matches },
        ];
      }),
    [rows, bucketSeconds],
  );
  const definition = useMemo(
    () =>
      defineChart({
        marks: [barY(bars, { id: 'activity', x: 'label', y: 'value', z: 'series', color: 'series', layout: group(), radius: 2 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.25), axis: TIME_AXIS },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { count: 4 } } },
        },
        color: { domain: ['Sessions', 'Matches'], range: [GOLD, BLUE], legend: colorLegend() },
        tooltip,
      }),
    [bars],
  );
  if (!rows.length) return <Empty label="Activity" />;
  return <Chart definition={definition} ariaLabel="Sessions and matches over time" height={HEIGHT} className="chart" />;
}

/** Frame-interval percentiles over time: the typical minute's p50 / p95 / p99. */
export function FramePacingChart({ rows, bucketSeconds }: { rows: PerfTimelinePoint[]; bucketSeconds: number }) {
  const points = useMemo<Point[]>(
    () =>
      rows.flatMap((r) => {
        const label = fmtBucket(r.t, bucketSeconds);
        return [
          { label, series: 'p50', ms: r.p50 },
          { label, series: 'p95', ms: r.p95 },
          { label, series: 'p99', ms: r.p99 },
        ];
      }),
    [rows, bucketSeconds],
  );
  const definition = useMemo(
    () =>
      defineChart({
        marks: [lineY(points, { id: 'pacing', x: 'label', y: 'ms', z: 'series', color: 'series', strokeWidth: 2, points: true })],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.15), axis: TIME_AXIS },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: 'ms / frame', ticks: { count: 4 } } },
        },
        color: { domain: ['p50', 'p95', 'p99'], range: [GREEN, GOLD, RED], legend: colorLegend() },
        tooltip,
      }),
    [points],
  );
  if (!rows.length) return <Empty label="Frame pacing" />;
  return <Chart definition={definition} ariaLabel="Frame interval percentiles over time" height={HEIGHT} className="chart" />;
}

/** Frames over 20 ms (a missed 60 Hz frame) per minute of play, per time bucket. */
export function LongFramesChart({ rows, bucketSeconds }: { rows: PerfTimelinePoint[]; bucketSeconds: number }) {
  const bars = useMemo<Bar[]>(() => rows.map((r) => ({ label: fmtBucket(r.t, bucketSeconds), series: 'Long frames / min', value: r.long20PerMin })), [rows, bucketSeconds]);
  const definition = useMemo(
    () =>
      defineChart({
        marks: [barY(bars, { id: 'long-frames', x: 'label', y: 'value', fill: RED, radius: 2 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.3), axis: TIME_AXIS },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: 'per minute', ticks: { count: 4 } } },
        },
        tooltip,
      }),
    [bars],
  );
  if (!rows.length) return <Empty label="Long frames" />;
  return <Chart definition={definition} ariaLabel="Long frames per minute over time" height={HEIGHT} className="chart" />;
}

/** How full rooms get: the number of rooms that reached each player count. */
export function RoomSizesChart({ rows }: { rows: RoomSizeRow[] }) {
  const bars = useMemo<Bar[]>(() => rows.map((r) => ({ label: `${r.peers} player${r.peers === 1 ? '' : 's'}`, series: 'Rooms', value: r.rooms })), [rows]);
  const definition = useMemo(
    () =>
      defineChart({
        marks: [barY(bars, { id: 'room-sizes', x: 'label', y: 'value', fill: BLUE, radius: 3, maxThickness: 64 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.4) },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { count: 4 } } },
        },
        tooltip,
      }),
    [bars],
  );
  if (!rows.length) return <Empty label="Room sizes" />;
  return <Chart definition={definition} ariaLabel="Rooms by number of players reached" height={HEIGHT} className="chart" />;
}
