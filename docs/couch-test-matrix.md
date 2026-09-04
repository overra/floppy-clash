# Couch-play test matrix (v1)

v1 needs two or more pads. Physical 4-pad evenings cannot be faked in CI.

| Browser | Xbox | DualSense | Switch Pro | Keyboard fallback |
| --- | --- | --- | --- | --- |
| Chrome | fixture mapped (`test/gamepad.test.ts`, Xbox 360 XInput STANDARD GAMEPAD) — pending physical device | fixture mapped (DualSense STANDARD GAMEPAD) — pending physical device | fixture mapped (Pro Controller STANDARD GAMEPAD) — pending physical device | **pass** `e2e/logic.spec.ts` + injected `navigator.getGamepads` |
| Edge | same Chromium mapping as Chrome; pending device | pending device | pending device | **pass** (Chromium logic e2e) |
| Firefox | fixture id recorded; pending device (non-standard maps open remap UI) | pending device | pending device | **pass** (unit: `readPad` + deadzone; no Firefox headed job here) |
| Safari | pending device; pads need a page gesture first | pending device | pending device | needs a page gesture first |

## Automated evidence (this repo)

| Check | Evidence |
| --- | --- |
| Boot → Solo vs Bots → join → start → canvas draws → round ends | `e2e/logic.spec.ts` (`__floppy.forceLastStand` + `[data-round-over]`) |
| Injected standard gamepad join + countdown HUD | `e2e/logic.spec.ts` (`getGamepads` stub) |
| Settings + editor (place / JSON) | `e2e/logic.spec.ts` |
| GPU init or Canvas fallback notice + pixel sample + Xvfb screenshot | `e2e/gpu.spec.ts` (`test-results/gpu-xvfb.png`; CI uploads the artifact) |
| Standard Xbox / DualSense / Switch Pro / Firefox-style fixtures → `PlayerInput` | `test/gamepad.test.ts` |
| 10-round fists + mid-round zero-input “disconnect” | `test/match.test.ts` |
| Simulated 100 ms / 2 % loss, 10 rounds, < 30 KB/s | `test/net.test.ts` |

## Still hardware-only

- Physical 4-pad session (join / ready / start / pause / Bluetooth disconnect-reconnect / haptics).
- Real iGPU 4 ms GPU time at 1080p / 500 groups / 60 fps laptop.
- Human footage feel sign-off vs the original.
- Live WAN 4-player WebRTC (STUN/TURN path).
