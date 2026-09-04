/**
 * Secrets are not bindings, so `wrangler types` (worker-configuration.d.ts) does not know about them.
 * They are optional on purpose: telemetry ingest works without any of them, only the /stats dashboard
 * needs all three. Set with `npx wrangler secret put <NAME>` — see docs/telemetry.md.
 */
interface Env {
  /** Bearer token the dashboard must present to `GET /api/stats`. */
  STATS_KEY?: string;
  /** The Cloudflare account that owns the Analytics Engine datasets (32 hex chars). */
  CF_ACCOUNT_ID?: string;
  /** API token with `Account Analytics: Read`, used to query the Analytics Engine SQL API. */
  CF_ANALYTICS_TOKEN?: string;
}
