# Feel checklist

Signed off against reference footage of Stick Fight-style movement. Numbers are from `src/sim/tuning.ts` and pinned by `test/movement.test.ts` (±10 %).

| Tech | Target | Notes |
| --- | --- | --- |
| Normal jump | ≈ 1.1× player height | `jumpSpeed` 11, gravity 30 |
| Punch jump | ≈ 1.5–2× | Aim up + attack on takeoff |
| Block punch jump | ≈ 2.5–3× | Hold block while punch-jumping |
| Wall climb | 6-tile shaft in ≤ 4 wall jumps | Gym walls at x=2 and x=8 |
| Run | 30 m in ≈ 4 s | `runSpeed` 8 |

Live tuning: press F2 to open the Tweakpane bound to `tuning.ts`.
