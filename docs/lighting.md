# 2D lighting (M5 stretch)

PLAN 4.11 / M5: optional radiance cascades fed by a Jump Flood SDF **texture**
of **live layer-1 solids**, with lava, muzzle flashes, and explosions as
emitters. The settings toggle is `2D lighting (radiance cascades)`.

## What the GPU path compiles

- `createJumpFlood` classify reads a packed AABB buffer of this frame's
  layer-1 groups. It is not a fixed center slab. The executor writes an
  `rgba16float` SDF (`sdfOutput`).
- Cascade `sdf:` **`textureLoad`s that JFA texture** (unfilterable-float bind,
  no `textureSample` / `float32-filterable`) and mins lava / muzzle /
  explosion cores. It does not re-evaluate live AABBs as a substitute for
  the flood field.
- Cascades are created only when the JFA texture exists and can be bound.
  If `jfa.run()` throws this frame, cascades are skipped (no stale / empty
  field). Glow may still run.
- When cascades produce an output texture, it is composited additively.

If SwiftShader (or a missing WebGPU feature) cannot create JFA, bind the
`rgba16float` texture, or run it, the path fails loud: `kind` is `glow` or
`off`, not a fake cascade pass.

## Automated stand-ins (not hardware)

- CPU Jump Flood + occluded emitter falloff (`test/lighting.test.ts`).
- CPU `cascadeSdfFromJfa` (sample the CPU field, then emitters) — proves
  the sample-the-texture algorithm when a field exists.
- TypeGPU `resolve` of classify + cascade DualFns (`textureLoad` / `jfaSdf`).

The 4 ms integrated-GPU budget and 60 fps / 1080p / 4-player feel check
are hardware / human sign-off. `LIGHTING_BUDGET_MS` only gates the settings
toggle against CPU `performance.now()` of the render function. CI does not
claim a 4 ms GPU time.

`readIdentity` (GPU e2e via `window.__floppy.readJfaIdentity`) runs JFA and
`textureLoad`s the field without the budget gate. It compares signs with the
CPU Jump Flood / classify stand-in. If JFA cannot be bound, the report is
`jfaBound: false` — not a fake cascade pass.
