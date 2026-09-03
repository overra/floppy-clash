# 2D lighting (M5 stretch)

PLAN 4.11 / M5: optional radiance cascades fed by a Jump Flood of **live
layer-1 solids**, with lava, muzzle flashes, and explosions as emitters.
The settings toggle is `2D lighting (radiance cascades)`.

## What the GPU path compiles

- `createJumpFlood` classify reads a packed AABB buffer of this frame's
  layer-1 groups. It is not a fixed center slab.
- Cascade `sdf` / `color` evaluate those same solids plus live emitters
  (not a disk at UV 0.5).
- When cascades produce an output texture, it is composited additively.
  If JFA / cascades reject (SwiftShader, missing features), the cheaper
  emitter glow pass still runs.

## Automated stand-ins (not hardware)

- CPU Jump Flood + occluded emitter falloff (`test/lighting.test.ts`).
- CPU classify / scene SDF that follow live solids.
- TypeGPU `resolve` of the classify and cascade DualFns.

The 4 ms integrated-GPU budget and 60 fps / 1080p / 4-player feel check
are hardware / human sign-off. CI does not claim them.
