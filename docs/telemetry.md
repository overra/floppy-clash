# Telemetry

How we know what the public is playing and how well it runs: anonymous usage and frame-pacing
statistics, written to **Cloudflare Workers Analytics Engine** and read back on the `/stats` page of
every deployment. No third-party script, no cookies, no accounts.

## Shape

```
browser ── POST /api/telemetry (batched, sendBeacon) ──▶ Worker ── writeDataPoint ──▶ Analytics Engine
RoomDO  ── room open/join/leave/close ─────────────────────────── writeDataPoint ──▶   (5 datasets)
                                                                                          ▲
/stats (React + TanStack Charts) ── GET /api/stats ──▶ Worker ── SQL API (bearer token) ──┘
```

- **Client** (`src/telemetry/`): `client.ts` queues events and posts a batch when 20 are waiting,
  30 s have passed, or the tab is hidden/closed (`navigator.sendBeacon`, falling back to a keepalive
  `fetch`). `perf.ts` folds every rAF interval into a fixed histogram so percentiles cost no
  allocations. `device.ts` classifies the user agent into device/OS/browser buckets. `schema.ts` is
  the Zod wire format; `points.ts` turns a batch into Analytics Engine rows.
- **Game** (`src/game.ts`, "Telemetry" section): one `page` row per load, a `match` row when a match
  starts and when it ends (with how: `finished`, `quit`, `host-ended`, `left`, `disconnected`,
  `restarted`, `unload`), a `perf` summary every 60 s of play and at match end, and `error` rows for
  script errors, frame-loop exceptions, WebGPU fallbacks, resyncs and refused room connections.
- **Worker** (`worker/telemetry.ts`): same-origin only, 32 KB body cap, strict schema validation,
  then one `writeDataPoint` per event, stamped with the deployment `ENVIRONMENT` and the visitor's
  country from `request.cf`. Never awaited, never blocks the relay or the assets.
- **Relay** (`worker/room.ts`): the Durable Object records every room open/join/refuse/leave/close
  with the peer count, connected time and close code — the only source of truth for room sizes and
  how online sessions end, since a browser that vanished cannot report it.
- **Dashboard** (`stats.html`, `src/stats/`): a separate Vite entry so the game bundle stays
  React-free. `worker/stats.ts` runs the SQL, the page draws it.

## Datasets

Analytics Engine columns are positional (`blob1..blob20`, `double1..double20`, one `index1`), so the
layout below *is* the schema. `src/telemetry/points.ts` is the source of truth; keep this table in
step, and only ever append columns. Every dataset has `blob1 = environment` (`production`, `preview`,
`development`) and `blob2 = country` (ISO 3166-1 alpha-2 or `XX`) so all of them filter alike. Client
rows use the random per-page-load session id as `index1` (the sampling key); relay rows use a random
per-hosting room instance id.

### `floppy_clash_sessions` — one row per page load

| Column | Meaning |
| --- | --- |
| blob3 · blob4 · blob5 | device (`desktop`/`mobile`/`tablet`) · os · browser |
| blob6 | renderer *setting* (`auto`/`gpu`/`canvas`); what actually rendered is on match/perf rows |
| blob7 | `direct` or `invite` (landed on a `?room=` link) |
| blob8 | `1` if installed as a PWA |
| double1 | 1 |
| double2 · double3 · double4 | viewport width · height · devicePixelRatio |
| double5 · double6 | CPU cores · device memory in GB (Chrome only, else 0) |
| double7 · double8 | touch (0/1) · connected gamepads |

### `floppy_clash_matches` — a `start` row and an `end` row per match, per browser

| Column | Meaning |
| --- | --- |
| blob3 | phase: `start` or `end` |
| blob4 · blob5 | mode (`local` couch / `solo` vs bots / `online`) · role (`offline`/`host`/`client`) |
| blob6 · blob7 | level id (`custom` for anything from the editor) · renderer that ran (`gpu`/`canvas`) |
| blob8 | outcome, end rows only |
| blob9 · blob10 · blob11 | device · os · browser |
| double1 | 1 |
| double2 · double3 | humans · bots in the match |
| double4 · double5 | first-to · max HP |
| double6 · double7 · double8 | seconds · rounds · kills (end rows; zeros on start) |
| double9 | 1 if this browser's fighter won (finished matches) |
| double10 | frames over 12 ms during the match |

Online matches produce one `start` per participant, so count them with `blob5 IN ('offline','host')`
to get matches rather than players.

### `floppy_clash_perf` — a frame-pacing summary per ~60 s of play and at match end

| Column | Meaning |
| --- | --- |
| blob3 · blob4 · blob5 | mode · role · renderer |
| blob6 | `periodic` or `end` |
| blob7 · blob8 · blob9 | device · os · browser |
| blob10 | `1` if the 2D lighting pass was on |
| double1 · double2 | frames · seconds in the slice |
| double3 · double4 · double5 · double6 | rAF interval p50 · p95 · p99 · max, ms (16.7 = 60 Hz) |
| double7 · double8 · double9 | frames over 12 / 20 / 50 ms |
| double10 … double13 | mean ms per frame in sim · frame build · render · GPU (F3 profiler stages) |
| double14 | mean live particles |
| double15 | dynamic resolution scale the GPU renderer settled on (0 on Canvas) |
| double16 | fighters in the match |
| double17 · double18 | online: relay RTT ms · resyncs requested (0 offline) |
| double19 | JS heap MB (Chrome only) |

### `floppy_clash_errors` — one row per distinct problem per session

| Column | Meaning |
| --- | --- |
| blob3 | kind: `js`, `rejection`, `frame`, `gpu-fallback`, `desync`, `room` |
| blob4 · blob5 | message (≤ 300 chars) · source (`file:line:col`, or a code such as the refusal) |
| blob6 · blob7 | where it happened (`menu`/`local`/`solo`/`online`) · renderer |
| blob8 · blob9 · blob10 | device · os · browser |
| double1 | 1 |

The client sends each `kind:message` once per page load and at most 10 error rows, so a tight loop
cannot flood the dataset. `gpu-fallback` is not a bug (the Canvas renderer took over); `desync` is a
client asking the host for a snapshot — a few per match is network, a steady stream is a determinism
bug (see [netcode.md](netcode.md)).

### `floppy_clash_relay` — written by the Durable Object, never by a browser

| Column | Meaning |
| --- | --- |
| blob3 | `open` · `join` · `refuse` · `leave` · `close` |
| blob4 | `host` or `client` |
| blob5 | why: refusal code (`room-taken`, `no-such-room`, `room-full`) or the WebSocket close code (`1000` clean, `1001` page closed, `1006` dropped, `error`) |
| blob6 | Cloudflare colo that served the socket |
| double1 | 1 |
| double2 | peers in the room after the event (a `close` writes 0) |
| double3 | seconds this socket was connected (`leave`/`close`) |
| index1 | room instance id: random per hosting, so one code's reuse over time does not blur together |

## Setting up a deployment

The bindings in [wrangler.jsonc](../wrangler.jsonc) are all the ingest side needs: datasets are
created on first write. The dashboard needs three secrets, per Worker (production and each preview
you want to look at):

```sh
npx wrangler secret put STATS_KEY           # any long random string; what you type into /stats
npx wrangler secret put CF_ACCOUNT_ID       # the account the Worker runs in
npx wrangler secret put CF_ANALYTICS_TOKEN  # API token with only "Account Analytics: Read"
```

Create the token in the Cloudflare dashboard (My Profile → API Tokens → Custom token, permission
*Account · Account Analytics · Read*, scoped to the one account). It can read every dataset in the
account and nothing else. Until all three exist `/api/stats` answers `503` naming the missing ones.

Open `https://<worker>/stats`, paste the `STATS_KEY`. It is kept in `sessionStorage` for that tab
only and sent as a bearer token; the Worker compares it in constant time and answers `401` on a
mismatch, at which point the page asks again. `?range=1h|24h|7d|30d` picks the window (5 min, 1 h,
6 h and 1 day buckets); `?env=all` lifts the environment filter (a preview Worker otherwise shows only
its own rows, production only production).

### Locally

`wrangler dev` accepts `/api/telemetry` posts but the Analytics Engine binding does not exist
locally: writes are dropped and the SQL API has nothing to say about local play. `/api/stats` works
against *production* data if you put the three secrets in a `.dev.vars` file (git-ignored), which is
the way to develop the dashboard: `npm run dev:worker` next to `npm run dev`, then open
`http://localhost:5173/stats`.

## Reading the numbers

Analytics Engine samples under load and every row carries `_sample_interval`, the number of rows it
stands for. Counts are `SUM(_sample_interval)`, means are `SUM(_sample_interval * x) / SUM(_sample_interval)`,
percentiles `quantileExactWeighted(p)(x, _sample_interval)`. The dashboard does this everywhere;
copy the pattern when you write your own. Data is kept for three months.

Matches started per mode in the last day, production only:

```sql
SELECT blob4 AS mode, SUM(_sample_interval) AS started
FROM floppy_clash_matches
WHERE timestamp > NOW() - INTERVAL '1' DAY
  AND blob1 = 'production' AND blob3 = 'start' AND blob5 IN ('offline', 'host')
GROUP BY mode ORDER BY started DESC
```

The typical minute's frame pacing by renderer and device, last week:

```sql
SELECT blob5 AS renderer, blob7 AS device,
       SUM(_sample_interval) AS minutes,
       quantileExactWeighted(0.5)(double3, _sample_interval) AS p50,
       quantileExactWeighted(0.5)(double5, _sample_interval) AS p99,
       SUM(_sample_interval * double8) / (SUM(_sample_interval * double2) / 60) AS long20_per_min
FROM floppy_clash_perf
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'production'
GROUP BY renderer, device ORDER BY minutes DESC
```

Run either with

```sh
curl "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" --data "<query>"
```

or point Grafana's Analytics Engine data source at the same token. The perf percentiles are the
*median across one-minute slices*, weighted by sampling — "how a typical minute of play feels" —
not a global per-frame percentile; per-frame data never leaves the browser.

## Privacy

- Nothing identifies a person: no cookies, no local storage, no IP, no user agent string. The
  session id is random per page load and dies with the tab; two visits from the same browser are
  unrelated. Country comes from the request's edge location and is stored as a two-letter code.
- Nothing a player typed is sent: no room codes, peer names or chat. The relay dataset records the
  *shape* of a room (counts, durations, close codes), never who was in it.
- Error messages are clipped at 300 characters and only carry what the browser's error event or the
  game itself produced. Level ids are only the built-in ones; anything from the editor is `custom`.
- Off switches: *Settings → Privacy → Share anonymous usage & performance stats*, and the browser's
  Global Privacy Control signal (`navigator.globalPrivacyControl`), which is honoured automatically.
  Either one stops the queue dead; nothing already sent can be traced back.
- `/stats` is staff-only behind `STATS_KEY`; the SQL token never leaves the Worker.

## Changing it

- New field: append a column (never insert), bump nothing — old rows simply read 0 / `''` there.
  Update `points.ts`, its header comment, the table above, the query in `worker/stats.ts` and the
  type in `src/telemetry/stats.ts`.
- New kind of event: new dataset. A dataset is a table; rows in it must mean the same thing.
- Breaking wire change: bump `TELEMETRY_VERSION` in `schema.ts`; the Worker rejects unknown versions
  with `400`, so stale tabs go quiet instead of writing garbage.
- `test/telemetry.test.ts` covers the histogram percentiles, device classification, schema limits,
  the batch → row mapping and the client's batching/opt-out; `worker/stats.ts` queries have no
  fixtures, so eyeball them on a preview before shipping.
