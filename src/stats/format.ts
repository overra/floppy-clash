/** Number and time formatting for the dashboard; everything is display-only. */

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

export function fmtInt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) >= 10_000 ? compact.format(v) : plain.format(Math.round(v));
}

export function fmtNum(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtMs(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)} ms`;
}

export function fmtPct(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return '—';
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

/** 95 → "1m 35s", 4000 → "1h 07m", 0 → "—". */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.round(h / 24)}d`;
}

/** Hours of play from seconds, one decimal. */
export function fmtHours(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0';
  const h = seconds / 3600;
  return h < 10 ? h.toFixed(1) : fmtInt(Math.round(h));
}

/** Axis label for a time bucket; how much of the date to show depends on how wide the buckets are. */
export function fmtBucket(unixSeconds: number, bucketSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  if (bucketSeconds >= 86_400) return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  if (bucketSeconds >= 6 * 3600) return `${d.toLocaleDateString('en', { weekday: 'short' })} ${String(d.getHours()).padStart(2, '0')}h`;
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "2024-05-01 12:00:00" (SQL API, UTC) or an ISO string → "3m ago". */
export function fmtAgo(when: string | number): string {
  const ms = typeof when === 'number' ? when : Date.parse(when.includes('T') ? when : `${when.replace(' ', 'T')}Z`);
  if (!Number.isFinite(ms)) return when ? String(when) : '—';
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}
