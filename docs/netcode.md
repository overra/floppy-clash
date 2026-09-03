# Netcode (M8)

Floppy Clash is host-authoritative. The host runs `src/sim`; clients send `PlayerInput` and render interpolated snapshots.

## Transport

- WebRTC DataChannels (`src/net/transport.ts`): unreliable/unordered for inputs, reliable/ordered for events (round phase, chat, settings, custom level JSON).
- Signaling (`server/signaling.ts`) only exchanges SDP/ICE for a room code. Public STUN is configured; TURN is optional and not bundled.
- `createLocalLoopback()` and `createSimulatedLink()` cover CI without a live WAN path.

## Snapshots

- Host broadcasts quantized binary snapshots at 20 Hz (`encodeSnapshotBinary`).
- Budget: **< 30 KB/s** per client with 4 players (asserted by `test/net.test.ts`).
- Clients keep a ~100–150 ms interpolation buffer (`src/net/interp.ts`). There is **no client prediction** and **no rollback**.

## Inputs

- Last 3 inputs are bundled for loss tolerance.
- Simulated 100 ms / 2 % loss 10-round match is a unit test (same numbers the plan allows Playwright shaping for).

## Documented limitation: reflect / parry delay

A perfect block is evaluated on the **host sim tick** that the bullet arrives. Clients see that tick ~100–150 ms later through the interpolation buffer.

That means:

- A client can press block “on time” on their screen and still miss the 9-tick (150 ms) reflect window if the host already simulated the hit.
- This matches the original’s online feel (no rollback). Couch / loopback play has no extra delay.

Live 4-player WAN WebRTC is hardware/network-only and is not faked in this repository.
