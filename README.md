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

Rules also cover **Items** (normal / low / off), **Hazards** (off strips arenas to ground and moving platforms) and **Fixed spawns**; items off plus hazards off is a neutral stage. Online, the host picks the mode and stocks in the lobby and every peer's mirror of the match is created with the same rules.

### Items

Alongside the guns, the sky drops pickups: the **Slugger** (hold to wind up, let go to swing; a full charge swings on its own), the **Walker Mine** (a mine on legs that hunts the nearest fighter), the **Mallet** (swings itself, no guard or wall-kick while you carry it), the **Repulsor Puck** (plants a bumper that bats fighters away) and four consumables taken on touch: **Mend Kit** (heals, or wipes percent in launch mode), **Lead Coat** (heavy: shoves land soft, jumps low), **Sprint Charm** (quick) and **Mirror Pin** (bullets and shells bounce back). Now and then a **Surge Orb** drifts in; break it and you are handed the Surge Cannon, one sweeping beam that hits everyone in its line.

### Online

**Online** hosts a room (or joins one by code / invite link). Up to four players; the host's browser runs the match and everyone else mirrors it — see [docs/netcode.md](docs/netcode.md). Your fighter takes the first pad you press a button on, otherwise keyboard and mouse. The host can fill empty seats with bots and keeps the tab in the foreground while playing.

Rooms go through a Cloudflare Durable Object relay that ships inside the same Worker as the game, so any deployment (production or a PR preview) is a complete multiplayer server. To develop the online path locally run `npm run dev:worker` next to `npm run dev`; Vite proxies `/ws` to it.

### Deploying (Cloudflare Workers) / PWA

`npm run build` emits `dist/`, served as static assets by the Worker in `worker/` ([wrangler.jsonc](wrangler.jsonc)). `npm run deploy` ships it from your machine (`npx wrangler login` first). In GitHub Actions the [deploy workflow](.github/workflows/deploy.yml) ships every push to `main` and the [preview workflow](.github/workflows/preview.yml) gives each pull request its own Worker (`floppy-clash-pr-<n>`) that is deleted when the PR closes. Both need a `CLOUDFLARE_API_TOKEN` repository secret (Workers Scripts: Edit) and a `CLOUDFLARE_ACCOUNT_ID` repository variable.

Install from the browser as a PWA (`public/manifest.webmanifest` + `sw.js`) for offline couch play. Distinctive weapon names (Oracle Pistol, Void Well, …) are used in the UI; data ids stay stable.

Settings persist HP, weapon/level toggles, remaps, audio, renderer, and the optional 2D lighting pass (`@typegpu/radiance-cascades` + Jump Flood, budget-gated). User levels from the editor join match rotation when that toggle is on.

### Usage and performance stats

Every deployment has a staff-only dashboard at `/stats`: sessions, matches by mode/level/outcome, devices and countries, frame pacing (p50/p95/p99, long frames, stage costs) by renderer and browser, room sizes and relay events, and grouped errors. The game batches anonymous events to `/api/telemetry` and the room relay reports its own lifecycle; both land in Cloudflare Workers Analytics Engine and are read back over its SQL API. Set three secrets (`STATS_KEY`, `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN`) and open the page — [docs/telemetry.md](docs/telemetry.md) has the schema, queries and what is (not) collected. Players can switch it off under Settings → Privacy; Global Privacy Control is honoured.

## Commands

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run dev:worker` | The Worker (room relay, telemetry and stats API) locally on :8787 via `wrangler dev` |
| `npm run check` | lint + typecheck (app and Worker) + unit tests + build |
| `npm test` | Vitest (headless sim) |
| `npm run test:e2e` | Playwright logic, online (two browsers through a local relay) and GPU smoke |
| `npm run deploy` | Build and deploy the Worker to Cloudflare |

## Architecture

DOM-free `src/sim` (Koota + Planck) steps at 60 Hz. `src/render` only reads a `RenderFrame`. WebGPU SDF renderer is preferred; Canvas 2D is the fallback and debug path. `src/telemetry` is the only thing that talks home, and `src/stats` (the `/stats` page, React + TanStack Charts) is a separate Vite entry so the game bundle stays framework-free. See [PLAN.md](PLAN.md).

## Legal

Mechanics only. No names, art, audio, or layouts copied from the original game. See [docs/netcode.md](docs/netcode.md) and [docs/couch-test-matrix.md](docs/couch-test-matrix.md).
