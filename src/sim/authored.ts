/**
 * Omitted (`undefined`) uses the create/catalog default.
 * Live `0` stays `0`. Never `||` — that turns an authored zero into the default.
 */
export function authored(value: number | undefined, omitted: number): number {
  return value ?? omitted;
}

/**
 * Authored full width → half-width from center. `0` is no reach.
 * Using the full width as `dx < w` doubles the physical box.
 */
export function authoredHalfWidth(fullWidth: number): number {
  return Math.abs(fullWidth) / 2;
}

/**
 * JSON / legacy wire flags. `Boolean("0")` is true — that turns an authored off
 * into on. Numbers and numeric strings use `!== 0` (`"0"` / `0` stay false).
 */
export function wireFlag(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (v == null || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n !== 0 : Boolean(v);
}

/**
 * Tag traits on the JSON/legacy wire (`Static`, `Dead`, …).
 * Host writes `{ on: 1 }`. `"0"` / `{ on: "0" }` stay off — `Boolean("0")` does not.
 * A bare object without `on` is presence (host never sends `{}`).
 */
export function wireTag(v: unknown): boolean {
  if (v == null || v === '') return false;
  if (typeof v === 'object') {
    const on = (v as { on?: unknown }).on;
    return on === undefined ? true : wireFlag(on);
  }
  return wireFlag(v);
}
