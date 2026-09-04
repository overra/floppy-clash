# Netcode

Floppy Clash online is **host-authoritative and deterministic**: every peer runs the full sim, and the
only thing that crosses the wire during a match is inputs.

## Shape

```
browser (host) ── WebSocket ──▶ RoomDO (one Durable Object per room code) ◀── WebSocket ── browser (client)
   runs the sim                  dumb relay: ids, join/leave, forwarding           mirrors the sim
```

- **Relay** (`worker/room.ts`): a Durable Object per room code, reached at `/ws/room/CODE`. It hands
  out peer ids, tells everyone who joined or left, and forwards opaque game messages. The host may
  address one peer or everyone; clients may only address the host. It keeps nothing but the sockets
  (hibernation API, `serializeAttachment`), so a room is exactly its connections and ends when the
  host disconnects. `ping`/`pong` is answered at the edge for latency readouts.
- **Session** (`src/net/room.ts`): the browser side of that connection, with readable refusals
  (`room-taken`, `no-such-room`, `room-full`).
- **Game messages** (`src/net/protocol.ts`): `lobby`, `start`, `input`, `frames`, `end`, `chat`,
  `resync`, `snapshot`.

## A match

1. The host presses Start. It picks the arena and a seed and sends `start` with the seed, level id,
   the slot list (peer or bot per fighter), the rules (HP, first-to, weapon/level toggles, rotation)
   and its custom levels. Everyone, host included, calls `createSimWorld` with exactly that.
2. Each tick the host steps with: its own input (quantized to what the wire carries), the latest input
   each remote fighter sent (`createRemoteInputs`), and nothing for bots (they think inside the sim).
   The packed inputs it stepped are appended to a `frames` message, flushed once per render frame.
3. Clients send their input only when it changes and at most once per tick, folding any tap pressed
   between two sends into the next one (`createInputSender`). The host applies remote inputs one per
   tick in arrival order and holds the last one, so a quiet client keeps doing what it was doing.
4. Clients step through `frames` as they arrive, leaning their clock to keep ~3 frames in hand
   (`pacingScale`) and bursting through a backlog after a hidden tab (`clientSteps`). Rendering,
   particles, audio, decals and camera all come from the local mirror, so nothing is replicated.
5. Every 60 ticks the host attaches its world hash. A client whose hash differs shows "resyncing",
   asks for a `snapshot` and applies it when it reaches that tick (`restoreWorld`).

Rematches are just another `start`. The host ending the match sends `end`; a client leaving the match
stays in the room and is dealt into the next one. Late joiners wait in the lobby until the next start.

## Determinism

Everything the sim does comes from the seed and the input stream: seeded RNG, tick-based timers,
bots that read `ctx.rng`, level rotation from the same pool on every peer (`enabledLevels` and the
host's `extraLevels` travel in `start`). `test/online.test.ts` steps a host and a client through 1800
ticks of noisy input, bots and kills and asserts identical hashes. Transcendental math
(`Math.sin`/`cos`/`hypot`) is deterministic within one JS engine; across engines it usually is, and
the hash check plus snapshot resync is the safety net if it is not.

## Latency

A client's press travels client → relay → host, is stepped there, and the frame travels back
host → relay → client: roughly one round trip to the relay's edge plus one to the host's, typically
100–250 ms input-to-screen for clients and 0 for the host. There is **no prediction and no rollback**
(the original's online feel). A perfect block is judged on the host's tick; a client can press block
"on time" on its screen and still miss the reflect window. Match hosts should keep their tab in the
foreground: a hidden host tab stops stepping and everyone waits.

## Bandwidth

Per client, per second: at most 60 small `input` messages up (a few KB/s) and 60 `frames` messages
down (~150–200 bytes each, ≤ 12 KB/s), well under the 30 KB/s budget. `start` is the only large
message and carries the host's custom levels.

## Local development and tests

- `npm run dev` + `npm run dev:worker`: Vite proxies `/ws` to `wrangler dev` on :8787, so the page
  talks to the relay on its own origin like it does in production.
- `e2e/online.spec.ts` runs two browsers through a real local relay: host, join by invite link, chat,
  start, hash agreement, steering from the client, end, leave, and a refused join.
- `src/net/simnet.ts` and `src/net/interp.ts` remain for latency/loss unit tests.
