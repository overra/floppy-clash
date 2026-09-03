# Feel checklist

Signed off against reference footage of Stick Fight-style movement. Numbers are from `src/sim/tuning.ts` and pinned by `test/movement.test.ts` (±10 %).

| Tech | Target | Notes |
| --- | --- | --- |
| Normal jump | ≈ 1.1× player height | `jumpSpeed` 11, gravity 30 |
| Punch jump | ≈ 1.5–2× | Aim up + attack on takeoff |
| Block punch jump | ≈ 2.5–3× | Hold block while punch-jumping |
| Wall climb | 6-tile shaft in ≤ 4 wall jumps | Gym shaft interior x=3–5, walls to y≈14 |
| Run | 30 m in ≈ 4 s | Dedicated `run-track` (60 m floor), `runSpeed` 8 |

Live tuning: press F2 to open the Tweakpane bound to `tuning.ts`.

Headless pins: `test/movement.test.ts`. GPU time / 1080p / 4 ms budgets are measured on an integrated-GPU laptop; CI SwiftShader only asserts correctness.
