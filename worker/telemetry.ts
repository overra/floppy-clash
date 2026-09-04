import { MAX_BATCH_BYTES, telemetryBatchSchema } from '../src/telemetry/schema';
import { toDataPoints, type ClientDataset } from '../src/telemetry/points';
import { jsonError, originAllowed, readBodyCapped } from './http';

/**
 * `POST /api/telemetry`: the game's anonymous usage / performance batches (src/telemetry/client.ts).
 * Validate strictly, stamp the environment and the visitor's country, write one Analytics Engine
 * point per event. Writes are fire-and-forget by design (`writeDataPoint` returns void); a bad
 * batch is simply refused. Nothing is stored anywhere else.
 */
export async function handleTelemetry(request: Request<unknown, IncomingRequestCfProperties>, env: Env): Promise<Response> {
  if (request.method !== 'POST') return jsonError(405, 'method not allowed');
  if (!originAllowed(request, new URL(request.url))) return jsonError(403, 'forbidden');
  const raw = await readBodyCapped(request, MAX_BATCH_BYTES);
  if (raw === null) return jsonError(413, 'batch too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonError(400, 'not json');
  }
  const batch = telemetryBatchSchema.safeParse(parsed);
  if (!batch.success) return jsonError(400, 'invalid batch', { issues: batch.error.issues.length });

  const country = request.cf?.country ?? 'XX';
  const points = toDataPoints(batch.data, { environment: String(env.ENVIRONMENT), country });
  for (const { dataset, point } of points) datasetBinding(env, dataset).writeDataPoint(point);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

function datasetBinding(env: Env, dataset: ClientDataset): AnalyticsEngineDataset {
  switch (dataset) {
    case 'sessions':
      return env.SESSIONS;
    case 'matches':
      return env.MATCHES;
    case 'perf':
      return env.PERF;
    case 'errors':
      return env.ERRORS;
  }
}
