/**
 * Omitted (`undefined`) uses the create/catalog default.
 * Live `0` stays `0`. Never `||` — that turns an authored zero into the default.
 */
export function authored(value: number | undefined, omitted: number): number {
  return value ?? omitted;
}
