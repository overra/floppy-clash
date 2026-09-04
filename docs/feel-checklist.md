# Feel checklist

Numbers are from `src/sim/tuning.ts` and pinned by `test/movement.test.ts` (±10 %).

| Tech | Target | Notes |
| --- | --- | --- |
| Normal jump | ≈ 1.1× player height | `jumpSpeed` 11, gravity 30 |
| Punch jump | ≈ 1.5–2× | Aim up + attack on takeoff |
| Block punch jump | ≈ 2.5–3× | Hold block while punch-jumping |
| Wall climb | 6-tile shaft in ≤ 4 wall jumps | Gym shaft interior x=3–5, walls to y≈14 |
| Run | 30 m in ≈ 4 s | Dedicated `run-track` (60 m floor), `runSpeed` 8 |

Live tuning: **F2** opens Tweakpane bound to `tuning.ts`.

Debug (PLAN 4.16): **F1** physics overlay, **F3** tick/hash/ms HUD, **F4** spawn pistol, **F5** kill P1, **F6** toggle slow-mo scale, **F7** freeze camera, **F8** GPU ↔ Canvas, **F9** download replay JSON.

## Hardware sign-off (not claimed)

Side-by-side footage vs Stick Fight and 60 fps on an integrated-GPU laptop at 1080p / 4 players / 200 bodies are **human / hardware** checks. CI SwiftShader only asserts correctness, never the 4 ms GPU budget.
