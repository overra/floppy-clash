/**
 * Omitted (`undefined`) uses the create/catalog default.
 * Live `0` stays `0`. Never `||` — that turns an authored zero into the default.
 */
export function authored(value: number | undefined, omitted: number): number {
  return value ?? omitted;
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
