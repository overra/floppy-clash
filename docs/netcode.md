# Netcode (M8)

Floppy Clash is host-authoritative. The host runs `src/sim`; clients send `PlayerInput` and render interpolated snapshots.

## Transport

- WebRTC DataChannels (`src/net/transport.ts`): unreliable/unordered for inputs and 20 Hz snapshots, reliable/ordered for events (round phase, chat, settings, custom level JSON, late-join full snap).
- Snapshot frames are **quantized `Uint8Array`** (`encodeWire` / `decodeWire`). The session layer accepts `ArrayBuffer` / `ArrayBufferView` as well as JSON strings (fallback).
- Signaling (`server/signaling.ts`) only exchanges SDP/ICE for a room code. Public STUN is configured; TURN is optional and not bundled.
- `createLocalLoopback()` and `createSimulatedLink()` cover CI without a live WAN path; both run snapshots through encode→decode so CI hits the same codec as WebRTC.

## Snapshots

- Host broadcasts quantized binary `WorldSnapshot`s at 20 Hz on the unreliable channel (`encodeSnapshotBinary` / `decodeSnapshotBinary`, wire version 2).
- **Full** snapshots go to late joiners (reliable) and as a periodic 1 Hz fallback on unreliable (`serializeWorld`).
- **Delta** snapshots use Koota `Changed(Transform)` plus `Added`/`Removed` on `NetId` (`serializeDelta`). Clients merge deltas onto the last full view, then interpolate.
- The binary frame carries every replicated trait (transform, BodyVel, combat, weapons, ragdolls, world traits, added/removed), not just motion.
- Dynamic bodies (loose weapons, projectile bodies, props, ragdoll parts) carry `BodyVel` `{ vx, vy, omega }` so late-join / interp restore continues in-flight motion (PLAN 4.13). Players also keep `Controller.vx/vy`.
- Budget: **< 30 KB/s** per client with 4 players (asserted by `test/net.test.ts` against the binary wire size).
- Clients keep a ~100–150 ms interpolation buffer (`src/net/interp.ts`). There is **no client prediction** and **no rollback**.

## Chat

- Lobby chat stays on the Online screen.
- Mid-match: Enter opens an in-HUD composer (`#matchchat`); Enter sends on the reliable channel; Escape cancels.

## Inputs

- Last 3 inputs are bundled for loss tolerance.
- Simulated 100 ms / 2 % loss 10-round match is a unit test (same numbers the plan allows Playwright shaping for).

## Documented limitation: reflect / parry delay

A perfect block is evaluated on the **host sim tick** that the bullet arrives. Clients see that tick ~100–150 ms later through the interpolation buffer.

That means:

- A client can press block “on time” on their screen and still miss the 9-tick (150 ms) reflect window if the host already simulated the hit.
- This matches the original’s online feel (no rollback). Couch / loopback play has no extra delay.

Live 4-player WAN WebRTC is hardware/network-only and is not faked in this repository.
