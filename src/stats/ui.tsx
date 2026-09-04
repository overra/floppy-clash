import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { SkeletonSwap } from './interior/skeleton-swap';
import { SortableTable, type SortState, type SortableColumn } from './interior/sortable-table';
import { useValueFlash } from './interior/value-flash';
import { fmtInt } from './format';

/** Building blocks shared by the dashboard panels; the surfaces match the interior.dev components. */

const SURFACE = 'rounded-[14px] border border-white/[0.16] bg-[#1D1D1A] shadow-[0_1px_6px_rgba(0,0,0,0.45)]';

export function Section({ title, hint, children, className = '' }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 ${className}`} aria-label={title}>
      <header className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-[13px] font-semibold text-stone-200">{title}</h2>
        {hint ? <p className="truncate text-[11.5px] text-stone-500">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function ChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Section title={title} hint={hint}>
      <div className={`${SURFACE} px-3 pt-3 pb-1`}>{children}</div>
    </Section>
  );
}

/**
 * A headline number that flashes green or red for a moment when a refresh changes it — the headless
 * half of interior.dev's Value Flash, dressed as a card.
 */
export function StatCard({ label, value, format = fmtInt, hint }: { label: string; value: number; format?: (v: number) => string; hint?: string }) {
  const { direction, flashing } = useValueFlash(value);
  const reduced = useReducedMotion();
  const tone = flashing ? (direction === 'up' ? 'text-emerald-400' : 'text-red-400') : 'text-stone-100';
  return (
    <div className={`${SURFACE} min-w-0 px-4 py-3`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">{label}</div>
      <motion.div
        initial={false}
        animate={{ scale: flashing && !reduced ? 1.04 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26, mass: 0.7 }}
        style={{ transformOrigin: 'left center' }}
        className={`mt-1 text-[26px] font-semibold leading-none tabular-nums transition-colors duration-300 ${tone}`}
      >
        {format(value)}
      </motion.div>
      <div className="mt-1 h-4 truncate text-[12px] text-stone-500">{hint ?? ''}</div>
    </div>
  );
}

export type DataTableProps<T> = {
  rows: T[] | undefined;
  columns: SortableColumn<T>[];
  getRowId: (row: T) => string;
  label: string;
  defaultSort?: SortState | null;
  /** Rows shown before the table scrolls. */
  visibleRows?: number;
  /** For wide tables on narrow screens. */
  minWidth?: number;
};

const ROW = 40;
const HEADER = 37;

/** interior.dev's Sortable Table behind a Skeleton Swap, sized so the swap does not move the page. */
export function DataTable<T>({ rows, columns, getRowId, label, defaultSort = null, visibleRows = 10, minWidth }: DataTableProps<T>) {
  const ready = rows !== undefined;
  const shown = Math.max(1, Math.min(rows?.length ?? 6, visibleRows));
  return (
    <SkeletonSwap ready={ready} label={label} lines={shown} lineHeight={ROW} reserve={HEADER + shown * ROW + 2} className="rounded-[14px]">
      <div className={minWidth ? 'overflow-x-auto' : ''}>
        <div style={minWidth ? { minWidth } : undefined}>
          <SortableTable rows={rows ?? []} columns={columns} getRowId={getRowId} label={label} rowHeight={ROW} maxHeight={visibleRows * ROW} defaultSort={defaultSort} />
        </div>
      </div>
    </SkeletonSwap>
  );
}

export function Notice({ tone = 'muted', children }: { tone?: 'muted' | 'error'; children: ReactNode }) {
  const color = tone === 'error' ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-white/[0.12] bg-white/[0.03] text-stone-300';
  return <div className={`rounded-[12px] border px-4 py-3 text-[13px] leading-relaxed ${color}`}>{children}</div>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-[5px] bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12px] text-amber-200">{children}</code>;
}
