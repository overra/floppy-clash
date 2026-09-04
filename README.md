# Floppy Clash

A 2–4 player couch physics brawler inspired by the *feel* of Landfall's Stick Fight — original name, art, audio, and levels. Stick figures punch, wall-jump, grab weapons that fall from the sky, and try to be the last one standing.

![Floppy Clash](public/favicon.svg)

## Play

```bash
npm install
npm run dev
```

Open the URL, click **Local Play**, **Solo vs Bots** or **Online**.

### Controllers

v1 is gamepad-first. Connect 2–4 pads (Xbox / DualSense / Switch Pro, W3C `standard` mapping).

- Move: left stick
- Jump: A / Cross (also LB)
- Aim: right stick
- Attack: RT (also RB)
- Block: LT
- Throw: Y / Triangle
- Pause: Start

Pads only appear after you press a button. Keyboard/mouse is a development fallback that can fill one seat (WASD, mouse aim, LMB/RMB, F to throw).

### Solo

**Solo vs Bots** starts a match against three utility bots from the main menu.

### Online

**Online** hosts a room (or joins one by code / invite link). Up to four players; the host's browser runs the match and everyone else mirrors it — see [docs/netcode.md](docs/netcode.md). Your fighter takes the first pad you press a button on, otherwise keyboard and mouse. The host can fill empty seats with bots and keeps the tab in the foreground while playing.

Rooms go through a Cloudflare Durable Object relay that ships inside the same Worker as the game, so any deployment (production or a PR preview) is a complete multiplayer server. To develop the online path locally run `npm run dev:worker` next to `npm run dev`; Vite proxies `/ws` to it.

### Deploying (Cloudflare Workers) / PWA

`npm run build` emits `dist/`, served as static assets by the Worker in `worker/` ([wrangler.jsonc](wrangler.jsonc)). `npm run deploy` ships it from your machine (`npx wrangler login` first). In GitHub Actions the [deploy workflow](.github/workflows/deploy.yml) ships every push to `main` and the [preview workflow](.github/workflows/preview.yml) gives each pull request its own Worker (`floppy-clash-pr-<n>`) that is deleted when the PR closes. Both need a `CLOUDFLARE_API_TOKEN` repository secret (Workers Scripts: Edit) and a `CLOUDFLARE_ACCOUNT_ID` repository variable.

Install from the browser as a PWA (`public/manifest.webmanifest` + `sw.js`) for offline couch play. Distinctive weapon names (Oracle Pistol, Void Well, …) are used in the UI; data ids stay stable.

Settings persist HP, weapon/level toggles, remaps, audio, renderer, and the optional 2D lighting pass (`@typegpu/radiance-cascades` + Jump Flood, budget-gated). User levels from the editor join match rotation when that toggle is on.

## Commands

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run dev:worker` | The Worker (room relay) locally on :8787 via `wrangler dev` |
| `npm run check` | lint + typecheck (app and Worker) + unit tests + build |
| `npm test` | Vitest (headless sim) |
| `npm run test:e2e` | Playwright logic, online (two browsers through a local relay) and GPU smoke |
| `npm run deploy` | Build and deploy the Worker to Cloudflare |

## Architecture

DOM-free `src/sim` (Koota + Planck) steps at 60 Hz. `src/render` only reads a `RenderFrame`. WebGPU SDF renderer is preferred; Canvas 2D is the fallback and debug path. See [PLAN.md](PLAN.md).

## Legal

Mechanics only. No names, art, audio, or layouts copied from the original game. See [docs/netcode.md](docs/netcode.md) and [docs/couch-test-matrix.md](docs/couch-test-matrix.md).
