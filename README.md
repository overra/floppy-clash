# Floppy Clash

A 2–4 player couch physics brawler inspired by the *feel* of Landfall's Stick Fight — original name, art, audio, and levels. Stick figures punch, wall-jump, grab weapons that fall from the sky, and try to be the last one standing.

![Floppy Clash](public/favicon.svg)

## Play

```bash
npm install
npm run dev
```

Open the URL, click **Local Play** or **Solo vs Bots**.

### Controllers

v1 is gamepad-first. Connect 2–4 pads (Xbox / DualSense / Switch Pro, W3C `standard` mapping).

- Move: left stick
- Jump: A / Cross (also LB)
- Aim: right stick
- Attack (punch / fire): RT (also X / Square)
- Kick: RB
- Block: LT
- Throw: Y / Triangle
- Pause: Start

Falling past a ledge with the stick toward it (or with nothing below to land on) catches the lip: jump hops up, toward climbs, down or away lets go, and attack is a get-up strike. A hang lasts a couple of seconds at most and a fresh grab needs a moment. In launch mode the grab comes with brief immunity.

Unarmed fighting has four strikes on two buttons: punch is the quick jab, kick is slower with more reach and knockback and wears down a raised guard (a few blocked kicks break it). Step into the target while pressing either and you throw the rear-limb version, a cross or a roundhouse: more wind-up, more hurt, longer recovery. A perfect block still stops anything.

Pads only appear after you press a button. Keyboard/mouse is a development fallback that can fill one seat (WASD, mouse aim, LMB punch, middle button or X/L kick, RMB block, F to throw).

### Solo

**Solo vs Bots** starts a match against three utility bots from the main menu.

### Modes

- **Last standing** (default): HP drains, the last fighter on their feet takes the round.
- **Launch**: damage builds a percentage that scales knockback, only the blast zone kills, and every fighter has a stock of lives per round. Hold the stick as a hit lands to steer the launch (DI). Rotation prefers the open-air island stages (Skyhold, Floe, Perch) unless you pick levels yourself. Weapons play by a launch balance table (`src/sim/weapons/launch.ts`): rapid fire and scatter shove less, single shots and melee more, thrown guns shove for capped damage, and the default drop list leaves out attrition weapons.

Rules also cover **Items** (normal / low / off), **Hazards** (off strips arenas to ground and moving platforms) and **Fixed spawns**; items off plus hazards off is a neutral stage.

### Static hosting / PWA

`npm run build` emits `dist/`. Deploy that folder to any static host (GitHub Pages, Netlify, nginx). The [pages workflow](.github/workflows/pages.yml) publishes `dist/` when this branch is merged to `main`. Install from the browser as a PWA (`public/manifest.webmanifest` + `sw.js`) for offline couch play.

Until Pages is enabled on the repo, serve locally with `npm run preview`. Distinctive weapon names (Oracle Pistol, Void Well, …) are used in the UI; data ids stay stable.

Settings persist HP, weapon/level toggles, remaps, audio, renderer, and the optional 2D lighting pass (`@typegpu/radiance-cascades` + Jump Flood, budget-gated). User levels from the editor join match rotation when that toggle is on.

## Commands

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run check` | lint + typecheck + unit tests + build |
| `npm test` | Vitest (headless sim) |
| `npm run test:e2e` | Playwright logic + GPU smoke |
| `npm run server` | WebRTC signaling (`ws` on :8787) |

## Architecture

DOM-free `src/sim` (Koota + Planck) steps at 60 Hz. `src/render` only reads a `RenderFrame`. WebGPU SDF renderer is preferred; Canvas 2D is the fallback and debug path. See [PLAN.md](PLAN.md).

## Legal

Mechanics only. No names, art, audio, or layouts copied from the original game. See [docs/netcode.md](docs/netcode.md) and [docs/couch-test-matrix.md](docs/couch-test-matrix.md).
