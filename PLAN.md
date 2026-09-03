# Stick Fight clone — Project Plan

> Working title: **stickfight-game** (the shipped game needs its own name — see [Legal / IP](#9-legal--ip)).
> Status: proposal v0.1. The repository is empty; nothing below is implemented yet.

## Table of contents

- [0. TL;DR](#0-tldr)
- [1. Goals, non-goals, principles](#1-goals-non-goals-principles)
- [2. Reference: how the original plays](#2-reference-how-the-original-plays)
- [3. Scope: feature parity checklist](#3-scope-feature-parity-checklist)
- [4. Technical architecture](#4-technical-architecture)
- [5. Milestones](#5-milestones)
- [6. Testing and quality](#6-testing-and-quality)
- [7. Risks and mitigations](#7-risks-and-mitigations)
- [8. Decisions log and open questions](#8-decisions-log-and-open-questions)
- [9. Legal / IP](#9-legal--ip)
- [Appendix A. Initial tunables](#appendix-a-initial-tunables)
- [Appendix B. Data formats](#appendix-b-data-formats)
- [Appendix C. Weapon roster](#appendix-c-weapon-roster)
- [Appendix D. Hazard catalog](#appendix-d-hazard-catalog)

---

## 0. TL;DR

- **What we are building**: a browser clone of Landfall's *Stick Fight: The Game* (2017) — a 2–4 player
  physics brawler. Stick figures punch, block, wall-jump, grab weapons that fall from the sky, and try to
  be the last one standing on small, deadly, ever-changing levels. Rounds are short; matches are endless.
- **Stack**: TypeScript + Vite, Canvas 2D renderer, **Planck.js** (a Box2D port — the same engine family
  Unity 2D, and therefore the original, is built on), Web Audio synthesized SFX, plain DOM menus,
  Vitest + Playwright. **No binary assets**: stick figures, levels, and sounds are all procedural.
- **Core architectural rule**: a DOM-free `sim/` package runs identically in the browser and in Node
  (headless tests, bots, and later an authoritative server). `render/` only reads from it. Every player
  — keyboard, gamepad, remote peer, or bot — is driven through one `PlayerInput` struct per tick.
- **Order of work** (each milestone is playable on its own):
  scaffold → movement feel → local versus with fists → weapons → hazards & levels → feel/polish →
  online → full arsenal → level editor → bots & release.

---

## 1. Goals, non-goals, principles

### Goals

1. Recreate the *feel* of Stick Fight: floppy physics characters, big knockback, recoil you can fly with,
   instant-death hazards, and 20–60 second rounds that end in chaos.
2. Couch multiplayer first (1 keyboard/mouse + up to 3 gamepads), online multiplayer second.
3. Data-driven content: weapons and levels are tables/JSON so that adding content never touches engine code.
4. Zero-install: runs from a static URL in any modern desktop browser at 60 fps on integrated graphics.
5. Agent/CI friendly: text-only assets, headless simulation, deterministic tests, one-command checks.

### Non-goals (v1)

- Steam features (Workshop, lobbies, achievements), consoles, native builds.
- Mobile/touch controls (the input model should not preclude them, but they are not designed for).
- Pixel-exact recreation of the original's levels, art, or audio (see [Legal / IP](#9-legal--ip)).
- Rollback/lockstep netcode. Online play is host-authoritative with interpolation (section 4.12).

### Principles

- **Feel over features.** Movement and hit reactions get tuned before more weapons are added.
- **Playable at the end of every milestone.** No milestone leaves the game unlaunchable.
- **Simulation is a library.** No `window`, `document`, or timers inside `src/sim`.
- **Everything random goes through the seeded sim RNG** so a seed + inputs reproduces a round.
- **Tunables live in one place** (`src/sim/tuning.ts`) and are editable live from the debug panel.

---

## 2. Reference: how the original plays

This section is the spec we clone against. Numbers come from the game and community-compiled guides and
are starting points for tuning, not gospel.

### 2.1 Controls (PC defaults)

| Action | Keyboard / mouse | Controller | Notes |
| --- | --- | --- | --- |
| Move | A / D (or arrows) | Left stick | |
| Jump | W / Space | A | Repeated jumps against walls climb them |
| Duck | S | Left stick down | Smaller target; "anchors" you against conveyors |
| Aim | Mouse position | Right stick | Aim direction drives punches, shots, blocks, throws |
| Attack | Left mouse (alt: C) | RT / X | Punch when unarmed, fire when armed |
| Block | Right mouse (alt: V) | LT / B | Hold; a block meter drains and refills when released |
| Throw weapon | F | Y | Thrown weapons are projectiles (55 dmg) |
| Chat | Enter | — | Online only |

### 2.2 Movement

- Run, jump, duck. Air control is generous.
- **Wall jump**: jump into a wall, then jump again while holding away from it. Chaining wall jumps
  climbs narrow shafts quickly.
- **Punch recoil**: punching pushes you along your aim direction. Aiming up while jumping and punching
  gives a **punch jump** (higher); adding block gives the **block punch jump** (highest). Holding down
  while punching gives a **punch slam** (fast descent). These are the game's core movement tech and are
  emergent from the physics; the clone must reproduce them deliberately.
- **Recoil boosting**: shotguns fling you backwards; the minigun works as a jetpack; the sawed-off can
  carry you across pits.
- **Weapon jumps**: weapons are solid physics objects; you can land on a falling weapon and jump off it.
- **Dropkick / airborne punch**: punching mid-air into an opponent knocks them back and disarms them.

### 2.3 Combat and rules

- HP default 100 (host can change: 1, 25, 50, 100, 200 …). No HP bar; damage is communicated through blood
  and ragdoll reaction.
- Fists: 22 damage, low knockback, disarm the victim. Headshots ×2, neck shots ×1.5.
- **Block**: shield in the aim direction. Punches and thrown weapons bounce off. A block started just
  before a bullet arrives **reflects it back along its trajectory**, owned by the blocker
  (a common way to win against a sniper). The block meter limits how long you can hold it.
- Knockback scales with weapon; many kills are "pushed off the map" rather than HP kills.
- Instant kills: spikes, spike balls, the void (out of bounds). Lava: 35 per touch. Barrels: 10–55.
- Death → full ragdoll + blood spray; corpses stay for the round and are solid.
- A round starts with a 3-second countdown, ends when ≤ 1 player is alive (brief slow-motion on the last
  kill), then a random (or ordered) next level loads. The wins leader wears a crown. Matches are endless;
  the win counter can be toggled.

### 2.4 Weapons

- Fall from the sky at random horizontal positions, starting a few seconds into the round and then
  periodically. Some levels have pre-placed weapons or scripted drops.
- Picked up by touching them when unarmed (short pickup cooldown after being thrown/dropped).
- Limited ammo; ammo is reset when a weapon is picked up again. Weapons are thrown with F.
- ≈45 weapons across 7 categories: Pistols, Rifles, Explosives, Snake, Lava, Melee, Other. Rare weapons
  (God Pistol, RPG, Black Hole) drop less often. The host can toggle each weapon. Full roster with stats:
  [Appendix C](#appendix-c-weapon-roster).

### 2.5 Levels

- ≈120 levels in 10 themed areas: Woods, Desert (box stacks that topple), Factory (conveyors, moving and
  rotating platforms), Castle (chains, spike balls, crushing walls), Winter (ice), Laser (timed beams),
  Western (barrels, snakes, starting weapons), Lava (rising lava, chain platforms), Halloween
  (disappearing platforms, bosses).
- Levels are small single-screen arenas; the camera zooms dynamically to frame the living players.
- Level editor with Steam Workshop sharing.

### 2.6 Presentation

Flat colors, thick round-capped lines, four player colors (yellow, blue, red, green), minimal HUD, blood
decals that persist for the round, small screen shakes, a short slow-mo on the winning kill.

---

## 3. Scope: feature parity checklist

| Area | Original | Clone target | Milestone |
| --- | --- | --- | --- |
| Players | 2–4 local or online | 1–4 local (M2), 2–4 online (M6) | M2 / M6 |
| Movement | run, jump, duck, wall jump, punch/block-punch jumps | same, tuned to comparable heights | M1 |
| Melee | fists 22 dmg, disarm, recoil | same | M2 |
| Block / parry | meter, deflect, timed reflect | same | M3 |
| Health | 100 default, host-configurable, head/neck multipliers | same | M2 / M3 |
| Death | ragdoll, blood, corpses solid | same | M2 |
| Rounds | 3 s countdown, last standing, slow-mo, crown, endless | same + optional "first to N" | M2 |
| Weapon drops | sky drops, physics pickups, throw, ammo | same | M3 |
| Weapons | ≈45 in 7 categories | 8 core (M3) → full roster (M7) | M3 / M7 |
| Hazards | spikes, lava, saws, lasers, platforms, chains, crates, barrels, conveyors, ice, crushers, disappearing | same catalog | M4 |
| Levels | ≈120 across 10 themes | 30 built-in across 6 themes at M4, 60+ by release | M4 / M9 |
| Camera | dynamic framing, shake | same | M1 / M5 |
| Audio | SFX + music | synthesized SFX, optional music | M5 |
| Settings | HP, weapon toggles, level toggles/order, win counter | same + input remapping, accessibility | M5 |
| Level editor | in-game + Workshop | in-browser editor, JSON import/export, share by URL | M8 |
| Online | Steam P2P lobbies, chat | WebRTC host-authoritative, room codes, chat | M6 |
| Bots | none (mods only) | simple bots for solo play and soak tests | M9 |
| Snakes (AI creatures) | from snake weapons and Western barrels | same | M7 |
| Bosses | Halloween boss levels | stretch goal | — |

---

## 4. Technical architecture

### 4.1 Stack decision

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **TypeScript + Vite + Canvas 2D + Planck.js** | Runs anywhere from a URL; no asset pipeline; sim runs headless in Node; Box2D-quality joints/raycasts/CCD; tiny bundle; easy CI | Must build our own scene/camera/particles (small for this art style); determinism only within one JS engine | **Chosen** |
| Phaser 3 (+ Matter.js) | Batteries included (input, scenes, tweens) | Matter's constraint solver is soft and jittery for ragdolls; fighting the framework once we bring our own physics | Rejected |
| Rapier 2D (WASM) | Very fast, cross-platform deterministic | Async WASM init, larger bundle, less mature JS docs; determinism only matters for lockstep, which we are not doing | Fallback if we ever need lockstep |
| Godot 4 | Great 2D physics, free, text scenes | Harder to test headless in this environment; export pipeline; not URL-shareable without extra work | Rejected for v1 |
| Unity | Closest to original | Binary assets and scenes, proprietary, unusable in headless agent/CI workflows | Rejected |

Supporting libraries (latest stable at scaffold time; versions pinned in `package.json`, not here):
`planck`, `zod` (level/weapon schema validation), `tweakpane` (debug tuning panel), `zzfx`-style
synth (or hand-written Web Audio), `vitest`, `@playwright/test`, `eslint` + `typescript-eslint`,
`prettier`. Menus are plain DOM/TS; adopt Preact only if the UI grows beyond a few screens.

### 4.2 Units, coordinates, time

- Physics units are meters, y-up (Box2D convention). Renderer flips y and scales by camera zoom.
- 1 level tile = 1 m. A stick figure is 1.8 m tall (≈ 2 tiles). Box2D is happiest with bodies 0.1–10 m.
- Fixed simulation tick: **60 Hz** (`dt = 1/60`), accumulator loop, render at display rate with
  interpolation between the previous and current tick. Physics iterations: 8 velocity / 3 position
  (Box2D defaults); raise if ragdoll stacks jitter.
- Everything time-based in the sim counts **ticks**, never wall-clock milliseconds.

### 4.3 Repository layout

```text
.
├── index.html
├── package.json, vite.config.ts, tsconfig.json, eslint.config.js, .prettierrc
├── PLAN.md                    # this document
├── docs/                      # deep dives added as milestones land (netcode, level schema, ADRs)
├── public/                    # favicon, PWA manifest (no game assets)
├── src/
│   ├── main.ts                # bootstrap: canvas, loop, UI, input → Game
│   ├── core/                  # fixed-step loop, seeded RNG, math/vec, events, id allocator
│   ├── sim/                   # DOM-free simulation (browser + Node)
│   │   ├── world.ts           # World: owns planck world, entities, rules; step(inputs)
│   │   ├── tuning.ts          # every gameplay constant (Appendix A)
│   │   ├── input.ts           # PlayerInput type + helpers
│   │   ├── physics/           # collision categories, contact router, raycast helpers
│   │   ├── player/            # controller, combat (punch/block), health, ragdoll
│   │   ├── weapons/           # defs table, Weapon entity, firing, projectiles, explosions
│   │   ├── hazards/           # one module per hazard type (Appendix D)
│   │   ├── level/             # zod schema, loader (JSON → bodies), themes
│   │   ├── rules/             # round/match state machine, spawner, scoring
│   │   ├── ai/                # (M9) bots, snakes (M7)
│   │   └── snapshot.ts        # serialize/restore for net + late join
│   ├── render/                # Canvas 2D renderer, camera, stick-figure animation, particles, decals, debug draw
│   ├── input/                 # keyboard/mouse/gamepad → PlayerInput; remapping; device→player assignment
│   ├── audio/                 # synth SFX, mixer, music (optional)
│   ├── ui/                    # DOM: main menu, join screen, settings, pause, scoreboard, lobby
│   ├── net/                   # (M6) transport (WebRTC), signaling client, host/client roles
│   ├── editor/                # (M8) level editor
│   └── levels/                # built-in levels as typed TS/JSON
├── server/                    # (M6) tiny signaling server (Node + ws); later optional dedicated host
├── test/                      # vitest: unit + headless sim tests
└── e2e/                       # playwright smoke tests
```

### 4.4 Game loop and data flow

```text
input devices ─┐                          ┌─ render/ (interpolated draw, particles, HUD)
gamepads ──────┼─▶ PlayerInput[4] ─▶ sim.step() ─▶ SimEvents ─┼─ audio/ (play SFX for events)
network peers ─┤        ▲                          └─ net/ (host broadcasts snapshots)
bots ──────────┘        └── same struct for everyone
```

- `PlayerInput` (per player, per tick): `moveX ∈ [-1,1]`, `jump`, `down`, `attack`, `block`, `throw`
  (booleans, edge-detected inside the sim), `aimX/aimY` (unit vector in world space).
- `sim.step(inputs)` advances exactly one tick and returns a list of `SimEvents`
  (hit, kill, shot, explosion, pickup, round-phase-change …). Render/audio/net consume events; they
  never reach into physics.
- The renderer keeps the previous tick's transforms to interpolate. Cosmetic state (particles, limb
  secondary motion, decals) lives entirely on the render side and is never replicated.

### 4.5 Physics design

**Collision categories** (bit flags) and the intended matrix:

| | Static | Dynamic prop | Player | Ragdoll | Loose weapon | Projectile body |
| --- | --- | --- | --- | --- | --- | --- |
| Player (alive capsule) | ✓ | ✓ | ✓ (stand on each other) | ✓ (corpses are solid) | ✓ (weapon jumps) | ✓ |
| Ragdoll part | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Loose weapon | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Projectile body (grenade, rocket, snake…) | ✓ | ✓ | ✓ except owner for first ~6 ticks | ✓ | ✓ | ✗ |

Hazard effects (lava, spikes, lasers, kill zones) use **sensor fixtures**: they report overlaps to the
contact router and never push anything. Their solid parts (a spike base, a saw hub) are ordinary static or
kinematic fixtures.

Bullets are **not bodies**: each tick a bullet sweeps a ray from its old to its new position
(`world.rayCast`), which gives continuous collision for free, keeps them cheap, and makes shield
reflection a simple test against the blocker's shield arc.

**Alive player = one dynamic capsule** (`fixedRotation: true`, friction 0 while moving; ground friction
applied manually) with a small ground sensor. Rationale: fully controllable, stable, cheap to replicate.
Head/neck/body hit zones are derived from the hit point's height within the capsule and the current pose
(ducking lowers the head zone).

**Limbs while alive are cosmetic**: procedural animation (run cycle, jump/fall/duck/wall-slide poses,
aim arm, block arms, punch extension) plus spring/verlet secondary motion driven by capsule velocity and
hit impulses. This produces the wobble without extra physics bodies or network traffic.

**Death = real ragdoll**: swap the capsule for 10 bodies (head, torso, upper/lower × arms/legs) joined by
revolute joints with angle limits, inheriting velocity plus the killing impulse. Ragdolls collide with
everything and are replicated (players stand on and shoot corpses).

Upgrade path if playtests say alive characters feel too stiff: attach physics arms (and later legs) to
the capsule via motor-driven revolute joints, non-colliding, with PD motors tracking the procedural pose.
This is isolated to `player/` + `render/` and does not change the controller.

### 4.6 Character controller

- **Ground movement**: each tick apply an impulse that moves `vx` toward `moveX * runSpeed` with
  `groundAccel`; in air use `airAccel`. Only correct velocity that is *below* run speed in the desired
  direction so knockback and recoil are preserved (external velocity is never fought).
- **Jump**: `vy = jumpSpeed` when grounded; coyote time and jump buffering in ticks.
- **Wall jump**: side raycasts detect walls. Airborne + pressing into a wall = wall slide (clamped fall
  speed). Jump while sliding → `(±wallJumpX away from wall, wallJumpY)` and lock horizontal input for a
  few ticks so the push is not cancelled. Repeated wall jumps on one wall must be possible (climbing).
- **Duck**: lowers hit zones and the render pose, raises ground friction (anchors on conveyors),
  reduces `runSpeed`.
- **Punch** (unarmed attack): applies a self-impulse along aim (this is what makes punch jumps and slams
  work), spawns a short-lived hit circle in front of the fist; hits deal damage + knockback along aim
  and knock the victim's weapon out of their hands. Cooldown in ticks.
- **Block**: hold → shield arc of `blockArc` degrees centered on aim; block meter drains while held and
  refills when released. Projectile hits inside the first `perfectBlockTicks` reflect (velocity mirrored
  along its own direction, owner = blocker); later hits are absorbed with small knockback. Melee and
  thrown weapons bounce. You cannot fire while blocking, but you can punch (block punch jump).
- **Facing**: derived from aim, not movement, so players can run backwards while shooting.

### 4.7 Combat, health, rounds

- `Health` component: `hp`, `maxHp` (match setting), `takeDamage(amount, zone, source)` applies
  multipliers (head ×2, neck ×1.5), emits blood events scaled by damage, and kills at `hp ≤ 0`.
- Instant-kill sources bypass HP. Out-of-bounds check against the level's kill bounds every tick.
- Round state machine: `Loading → Countdown(3 s) → Fighting → LastKill(slow-mo 0.25× for ~1.2 s) →
  Scoreboard(optional) → Loading`. Draw when all remaining players die on the same tick.
- Match state: wins per player, crown on the leader, optional `firstTo` limit and optional win counter
  display; level rotation `random | ordered` with a no-immediate-repeat rule.
- Spawning: levels define ≥ 4 spawn points; assignment is shuffled by the sim RNG each round.

### 4.8 Weapons

- **Definitions** are data (`src/sim/weapons/defs.ts`, validated by zod): id, category, ammo, damage,
  fire mode (semi/auto/burst), fire interval, spread, projectile kind, muzzle speed, gravity scale,
  bounce count, explosion radius/damage/impulse, recoil impulse (backward/upward/forward components),
  knockback impulse, drop weight, two-handed flag, render shape descriptor, sound id.
- **Projectile kinds**: `bullet` (swept ray), `pellets` (N bullets with spread), `grenade` (dynamic
  body, bounce, fuse), `rocket` (body, no gravity, explode on contact), `beam` (raycast line for N
  ticks after an optional warning), `melee` (short arc hitbox + forward lunge), `field` (black hole,
  time bubble, glue), `creature` (snake AI body), `burst-into` (spawns other projectiles on impact).
- **Weapon entity** has two states: *loose* (dynamic box body, solid to players, picked up by contact
  when the player is unarmed and the weapon's pickup cooldown expired) and *held* (body deactivated,
  rendered in the hand along the aim; muzzle = hand + barrel length). Throwing re-activates the body at
  the hand with `aim * throwSpeed + playerVelocity`; a thrown weapon deals `thrownDamage` on its first
  hit, then becomes a normal loose weapon after `pickupCooldown`. Ammo refills on pickup (faithful quirk,
  tunable). When ammo hits 0 the weapon is flung out of the hand (tunable).
- **Weapon drops**: `Spawner` picks an enabled weapon by drop weight, spawns it at a random x within the
  level's `dropRange` above the top bound, `firstDropDelay` after the countdown and then every
  `dropInterval` (randomized), capped by `maxLooseWeapons`. Levels may override or disable drops and
  place starting weapons.
- **Firing**: recoil impulse on the shooter (this is the "jetpack"), spread from the sim RNG, muzzle
  flash/shot events for render/audio. Bullets that hit a held weapon's far end are deflected; hits near
  the hand disarm (fidelity detail, low priority).
- **Explosions**: AABB query → per body: impulse with falloff, player damage with falloff, destructible
  damage, `explosion` event (shake, particles, sound). Self-damage is on.

### 4.9 Levels and hazards

- Levels are JSON (schema in [Appendix B](#appendix-b-data-formats)): bounds, kill bounds, spawn points,
  theme, drop settings, decorations (render-only), and a list of objects with `type` + typed props.
  Built-in levels are authored as typed TS modules so the compiler and zod both check them; the editor
  (M8) exports the same shape.
- Hazards are small modules registered by `type` string: `create(world, def)` builds bodies/joints,
  `step(tick)` drives kinematics, and contact callbacks apply effects. The catalog and physics
  implementation notes are in [Appendix D](#appendix-d-hazard-catalog).
- Themes define a palette (background, solids, accents, blood tint) and a decoration set; a level's look
  is `theme + geometry`, so theme changes are free.

### 4.10 Camera and rendering

- Camera fits all alive players plus padding, clamped to level bounds, with smoothed position/zoom;
  minimum zoom always shows the whole arena. Screen shake from explosion/hit events; slow-mo scales the
  sim step multiplier, not the render rate.
- Renderer draws in layers: background + decorations (parallax-lite) → decals (offscreen canvas that
  accumulates blood for the round) → level solids → weapons/projectiles → players (stick figures) →
  particles → world-space UI (crown, laser sights, block arc, sniper beam) → screen-space HUD.
- Stick figure: filled head circle, torso line, two 2-segment arms and legs, round line caps, player
  color; ~0.08 m line width. Weapons are simple rectangles/lines on a per-weapon descriptor.
- Debug draw: physics wireframes, hit zones, raycasts, contact points, entity ids; toggled with a key.

### 4.11 Input

- Device → player assignment on a join screen ("press jump to join"): keyboard+mouse is one device;
  each gamepad is another. A second keyboard-only player is supported with aim = facing/arrow keys.
- Keyboard/mouse aim: `normalize(mouseWorld − playerPos)`. Gamepad aim: right stick, falling back to
  left stick direction when idle (dead zones and stick-release aim-hold in ticks).
- Remappable bindings stored in `localStorage`; Gamepad API polling each frame; input is sampled into
  `PlayerInput` at each sim tick (edge detection happens in the sim so replays/netcode work).

### 4.12 Networking (M6)

- **Model**: host-authoritative. The host runs the sim; clients send `PlayerInput` every tick over an
  unreliable/unordered channel with the last 3 inputs bundled for loss tolerance. The host broadcasts
  binary snapshots at 20 Hz; clients render with a ~100–150 ms interpolation buffer. Reliable ordered
  channel for events (round phases, spawns/despawns, level change, chat, settings).
- **Transport**: WebRTC DataChannels between peers, with a tiny signaling server (`server/`, Node + `ws`)
  that only exchanges SDP/ICE for a room code. Public STUN; TURN optional. Because `sim/` is DOM-free,
  the same code can later run as a **dedicated authoritative server** over WebSockets for players without
  a good host.
- **Replication**: players (position, velocity, aim, flags, hp, weapon id, ammo), dynamic bodies (loose
  weapons, projectile bodies, dynamic props, ragdoll parts) as quantized transforms with stable net ids;
  bullets replicate as spawn events (their paths are deterministic). Late joiners get a full snapshot.
  Budget: < 30 KB/s per client with 4 players.
- **Prediction**: none for v1 (matches the original's feel and avoids physics rollback). Local input
  latency mitigation later, if needed: predict only the local capsule's horizontal movement and jump.
- Prepared from M0: seeded RNG, tick-based timing, `PlayerInput` indirection, stable ids, snapshot API.

### 4.13 Bots (M9) and snakes (M7)

- Snakes: small AI bodies that pathfind trivially (move toward nearest player, hop), have HP scaled to
  the match HP, bite on contact, take head/neck multipliers.
- Bots: utility-scored actions (grab nearest weapon, approach/retreat, aim with noise, block when a
  bullet approaches, avoid hazards using short raycasts and level kill zones, jump/wall-jump heuristics).
  Bots are also the engine of headless soak tests.

### 4.14 Level editor (M8)

In-browser: object palette, grid snapping, drag/rotate/resize, property panel generated from each
hazard's zod schema, spawn points and drop range tools, one-click playtest, undo/redo, import/export
JSON, share via compressed URL hash, local library in IndexedDB, user levels selectable in match settings.

### 4.15 Debug tooling (from M1)

Tweakpane panel bound to `tuning.ts`; spawn-weapon/kill/slow-mo/free-camera cheats; physics overlay;
frame/tick timing HUD; state hash display for determinism checks; input recorder that saves seed +
inputs to a JSON replay.

---

## 5. Milestones

Sizes are relative engineering effort (S < M < L < XL) by number of subsystems touched and how invasive
the changes are. Each milestone lists its deliverables and acceptance criteria.

### M0 — Scaffold (S)

- Vite + TypeScript (`strict`), ESLint + Prettier, Vitest, Playwright, `npm run check`
  (lint + typecheck + unit tests + build) as the single CI entry point; static deploy of `dist/`.
- `core/` fixed-step loop, seeded RNG, vec math; `sim/world.ts` wrapping Planck; canvas renderer with
  camera and debug draw; a flat test level with a falling box.
- **Accept**: `npm run dev` shows a box landing on the floor at 60 fps; `npm run check` passes; a Vitest
  headless test steps the world 600 ticks and asserts the box is at rest.

### M1 — Movement prototype (M)

- Player capsule controller: run, jump (coyote/buffer), duck, wall slide + wall jump, punch self-impulse
  (punch jump / slam), block pose (no combat effect yet), aim from mouse and gamepad.
- Procedural stick-figure animation with secondary motion; dynamic camera; tuning panel; input replay
  recorder.
- Test level "gym": shafts to wall-climb, gaps calibrated to normal / punch / block-punch jumps.
- **Accept**: feel checklist signed off against reference footage — normal jump ≈ 1.1× player height,
  punch jump ≈ 1.5–2× (depends on punch timing), block punch jump ≈ 2.5–3×, climb a 6-tile shaft in
  ≤ 4 wall jumps, run 30 m in ≈ 4 s; headless tests assert the tuned numbers within ±10 %.

### M2 — Local versus with fists (L)

- Join screen (up to 4 devices), player colors, pause. Punch damage/knockback/disarm hooks, HP, death →
  ragdoll + blood events, out-of-bounds death, solid corpses.
- Round/match state machine: countdown, last-standing detection, slow-mo, scoreboard overlay, crown,
  random/ordered rotation, optional first-to-N.
- 5 hand-authored flat-ish levels in 2 themes; level JSON schema v1 + loader.
- **Accept**: four local players complete a 10-round session with fists only without a crash; a headless
  bot-vs-bot fuzz run of 20 000 ticks produces no exceptions or NaNs.

### M3 — Weapons (L)

- Weapon entity (loose/held/thrown), drop spawner, pickup cooldowns, ammo, throw damage, aim rendering,
  recoil, headshot/neck zones, weapon toggles in settings.
- Core roster of 8 archetypes: Pistol, Revolver, Uzi, AK-47, Sawed-Off, Sniper (laser sight),
  Grenade Launcher, RPG. Swept bullets, pellets, grenades, rockets, explosions, destructible-block damage
  hooks.
- Block combat: deflect melee/thrown, timed reflect for bullets, block meter.
- Synth SFX for shots/hits/explosions/pickups (minimal set; full pass in M5).
- **Accept**: every weapon in the roster can kill, boost (recoil), be thrown, be blocked and reflected;
  parity table numbers (Appendix C) are the defaults; headless tests cover reflect timing, headshot
  multiplier, ammo/refill, pickup cooldown, explosion falloff.

### M4 — Hazards and levels (L)

- Hazard catalog (Appendix D) implemented as modules; kinematic path system; destructibles; chains.
- Level schema v2 (all hazard props), 30 built-in levels across Woods, Desert, Factory, Castle, Lava,
  Winter; level toggles and ordering in settings; per-hazard test levels.
- **Accept**: each hazard has a test level and a headless test (e.g., player touching spikes dies on
  that tick; moving platform carries a standing player; chain breaks after N damage); no tunneling of
  players through moving hazards at 60 Hz.

### M5 — Feel and polish (M)

- Blood particles + decals, sparks, smoke, muzzle flashes, hit-stop, screen shake, kill slow-mo polish,
  camera tuning, crown/scoreboard art, theme decorations.
- Full SFX set and optional procedural music; audio mixer settings.
- Settings: HP, weapon/level toggles, win counter, first-to-N, input remapping, colorblind palette,
  reduce-shake/blood toggles. PWA manifest for offline play.
- Optional: physics arms on alive players if the feel review calls for it (see 4.5 upgrade path).
- **Accept**: side-by-side feel review with the original passes the checklist in `docs/feel-checklist.md`
  (created in M1); 60 fps on an integrated-GPU laptop at 1080p with 4 players and 200 bodies.

### M6 — Online multiplayer (XL)

- `server/` signaling (rooms, SDP/ICE relay); `net/` WebRTC transport, host/client roles, input
  bundling, binary snapshots with quantization, interpolation buffer, event channel, late join,
  disconnect handling, text chat, lobby UI with room codes and host-only settings.
- Snapshot API in `sim/` (serialize/restore) and net ids for all replicated entities.
- **Accept**: 4 players at simulated 100 ms / 2 % loss (Playwright + network shaping or a local proxy)
  finish a 10-round match; client bandwidth < 30 KB/s; no visible desync on kills; reflect/parry works
  within the interpolation delay (documented limitation, as in the original).

### M7 — Full arsenal and creatures (L)

- Remaining categories from Appendix C: Deagle, God Pistol, M16 (bursts), M1, Military Shotgun, Bouncer;
  Thruster; Snake weapons + snake AI; Lava weapons (spike ball, spike gun, spray, beam, stream);
  Melee (sword, spear, blink dagger); Other (time bubble, laser, ice gun, black hole, glue gun, minigun,
  flamethrower + burn status).
- New projectile kinds: `beam`, `melee`, `field`, `creature`, `burst-into`; status effects (burning,
  slowed, glued, bubbled).
- **Accept**: roster parity table fully checked; each new kind has a headless test; net replication
  covers new entity types (fields, creatures) with no new special cases in the transport.

### M8 — Level editor (L)

- Editor described in 4.14; user levels in IndexedDB; import/export/share; user levels in rotation.
- **Accept**: build a level with every hazard type in the editor, export it, reload it, play it locally
  and online (host sends custom level JSON to clients).

### M9 — Bots, content, release (M)

- Bots for solo/local fill and soak tests; 60+ built-in levels (remaining themes: Laser, Western,
  Halloween); README, contributor docs, itch.io/static hosting release, name/logo distinct from the
  original.
- Stretch: replays (seed + inputs, local only), boss levels, local stats/achievements.
- **Accept**: a solo player can start a match against 3 bots from the main menu; release build deployed
  and linked from the README.

---

## 6. Testing and quality

- **Unit (Vitest)**: RNG determinism, vec math, damage multipliers, weapon/level schema validation,
  round/match state machine, input edge detection, snapshot round-trip.
- **Headless sim tests (Vitest, Node)**: build a world from a test level with a seed, script
  `PlayerInput` sequences, assert positions/events/tick counts (jump heights, wall-jump climb, bullet hit
  point, parry window, hazard effects). A **golden determinism test** runs a fixed seed + scripted inputs
  for 600 ticks and compares a state hash; updating the hash must be a deliberate commit.
- **Fuzz/soak**: random or bot inputs for tens of thousands of ticks; assert no exceptions, no NaN/Inf
  transforms, bounded entity counts, bounded physics step time.
- **E2E (Playwright, Chromium)**: boot → join → start local match vs bot → round ends → screenshot;
  gamepad emulation via injected `navigator.getGamepads`; used to produce walkthrough recordings.
- **Performance budgets**: physics step ≤ 3 ms (4 alive + 3 ragdolls + 30 dynamic props), render
  ≤ 4 ms at 1080p, initial bundle ≤ 600 KB gzip, particles capped (2 000) and decals rendered to an
  offscreen canvas.
- **Conventions**: TypeScript `strict`, no `any` in `sim/`, conventional commits, one PR per milestone
  task, ADRs in `docs/adr/` for decisions that change this plan.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Movement/combat does not "feel like Stick Fight" | Core value of the game | M1 is dedicated to feel with a written checklist, reference footage comparison, live tuning panel, and headless tests that pin the tuned numbers |
| Ragdoll instability (jitter, explosions, joint stretching) | Ugly deaths, physics blow-ups | Keep mass ratios < 10:1, joint limits, low restitution, 8/3 iterations, cap impulses, clamp velocities; corpses despawn to particles if they leave bounds |
| Fast projectiles tunnel through thin geometry or moving hazards | Unfair deaths/misses | Bullets are swept rays; grenades/rockets use `bullet` bodies; moving hazards are kinematic with per-tick sweep tests for players |
| Networking complexity and desync | Online unplayable | Host-authoritative + interpolation (no rollback); sim/net boundary built from M0; simulated latency/loss tests; dedicated-server fallback |
| Scope creep from the 45-weapon roster | Never finishing | 8 archetypes in M3 define all projectile kinds; the rest is data + a few new kinds in M7 |
| Browser input limitations (keyboard ghosting, gamepad quirks, pointer lock) | Couch play frustration | Remappable bindings, per-browser gamepad mapping table, no reliance on pointer lock |
| Canvas 2D performance with many decals/particles | Frame drops | Offscreen decal canvas, particle pool caps, dirty-region-free but layered drawing; WebGL renderer swap is isolated to `render/` |
| IP/trademark issues | Takedown | Original name, art, sounds, level designs; mechanics only (section 9) |

---

## 8. Decisions log and open questions

### Decided (defaults this plan proceeds with)

1. Web/TypeScript stack with Planck.js; Canvas 2D renderer. (4.1)
2. Alive player = controlled capsule + cosmetic limbs; dead player = true ragdoll. (4.5)
3. Bullets are swept rays; explosives are bodies. (4.5, 4.8)
4. Local multiplayer before online; online is host-authoritative with interpolation, no rollback. (4.12)
5. Endless matches by default with an optional first-to-N, as a quality-of-life addition. (4.7)
6. Faithful quirks kept as tunables: ammo refills on pickup, empty weapon is flung. (4.8)
7. No binary assets; synthesized audio. (1)

### Open questions (answers change scope, defaults apply otherwise)

1. Confirm the web stack vs. a Godot/Unity build. Default: web.
2. Is online play required for the first public release, or can it ship after local play? Default: after.
3. Faithful weapon roster and names vs. an original arsenal? Default: faithful mechanics, renamed where a
   name is distinctive (e.g. "God Pistol") before public release.
4. Desktop browsers only? Default: yes; touch controls are out of scope.
5. Level count target for release and whether the editor should come before online. Default: 60+, editor
   after online.

---

## 9. Legal / IP

Game mechanics are not protected, but names, artwork, audio, and level designs are. The clone uses its own
title and logo, original procedural art and synthesized audio, and original level layouts inspired by
the themes rather than copied. Weapon names in this plan are references for parity; distinctive ones are
renamed before any public release. No files from the original game are ever added to this repository.

---

## Appendix A. Initial tunables

All values live in `src/sim/tuning.ts`, are editable live from the debug panel, and are starting points.

| Group | Name | Start value | Notes |
| --- | --- | --- | --- |
| World | `gravity` | 30 m/s² | Snappier than real gravity, typical for platform brawlers |
| World | `tickRate` | 60 Hz | |
| Player | `height` / `radius` | 1.8 m / 0.3 m | Capsule |
| Player | `runSpeed` | 8 m/s | Duck: ×0.5 |
| Player | `groundAccel` / `airAccel` | reach target in 6 / 20 ticks | |
| Player | `jumpSpeed` | 11 m/s | ≈ 2.0 m apex ≈ 1.1× height |
| Player | `coyoteTicks` / `jumpBufferTicks` | 5 / 6 | |
| Player | `wallSlideMaxFall` | 3 m/s | While pressing into wall |
| Player | `wallJumpX` / `wallJumpY` / `wallJumpLockTicks` | 7 / 10 m/s / 8 | |
| Punch | `punchSelfImpulse` | Δv 4 m/s along aim | Punching upward at takeoff → ≈ 2× height; block adds `blockPunchBonus` Δv 3 m/s (→ ≈ 3×) |
| Punch | `punchDamage` / `punchKnockback` | 22 / Δv 6 m/s (+0.3 up) | Disarms |
| Punch | `punchRange` / `punchRadius` / `punchActiveTicks` / `punchCooldownTicks` | 0.9 m / 0.45 m / 4 / 20 | |
| Block | `blockArcDeg` | 120° | Centered on aim |
| Block | `blockMeterDrainTicks` / `blockMeterRefillTicks` | 72 / 60 | Refill starts 18 ticks after release |
| Block | `perfectBlockTicks` | 9 | Reflect window (150 ms) |
| Health | `maxHp` | 100 | Setting: 1 / 25 / 50 / 100 / 200 |
| Health | `headshotMult` / `neckMult` | 2.0 / 1.5 | Head zone = top 0.45 m of pose, neck = next 0.15 m |
| Weapons | `throwSpeed` / `thrownDamage` | 18 m/s / 55 | Plus player velocity |
| Weapons | `pickupCooldownTicks` | 30 | After throw/drop |
| Weapons | `refillOnPickup` / `flingWhenEmpty` | true / true | Faithful quirks |
| Drops | `firstDropDelayTicks` / `dropIntervalTicks` / `maxLooseWeapons` | 180 / 360–600 / 6 | |
| Hazards | `lavaDamage` / `lavaCooldownTicks` | 35 / 30 | Spikes, spike balls, void, lasers: instant |
| Rounds | `countdownTicks` / `lastKillSlowmo` / `slowmoTicks` / `scoreboardTicks` | 180 / 0.25× / 72 / 90 | |
| Camera | `padding` / `lerp` / `zoomLerp` | 4 m / 0.12 / 0.08 | Never zoom past whole-arena view |

## Appendix B. Data formats

`PlayerInput` (one per player per tick):

```ts
interface PlayerInput {
  moveX: number;   // -1..1
  jump: boolean;   // held; edges detected in sim
  down: boolean;
  attack: boolean;
  block: boolean;
  throw: boolean;
  aimX: number;    // unit vector, world space
  aimY: number;
}
```

Level (schema v1; validated with zod, extended per hazard in M4):

```jsonc
{
  "id": "woods-01",
  "name": "Clearing",
  "theme": "woods",
  "bounds": { "x": 0, "y": 0, "w": 32, "h": 18 },        // camera clamp, meters, y-up
  "killMargin": 6,                                       // void beyond bounds + margin
  "spawns": [{ "x": 4, "y": 6 }, { "x": 28, "y": 6 }, { "x": 10, "y": 12 }, { "x": 22, "y": 12 }],
  "drops": { "enabled": true, "xMin": 4, "xMax": 28, "intervalScale": 1.0 },
  "startingWeapons": [{ "weapon": "revolver", "x": 16, "y": 8 }],
  "objects": [
    { "type": "solid", "x": 16, "y": 1, "w": 32, "h": 2 },
    { "type": "platform.moving", "x": 16, "y": 9, "w": 6, "h": 1,
      "path": [{ "x": 8, "y": 9 }, { "x": 24, "y": 9 }], "speed": 3, "mode": "pingpong" },
    { "type": "spikes", "x": 16, "y": 2.5, "w": 6, "dir": "up" },
    { "type": "block.destructible", "x": 6, "y": 4, "w": 2, "h": 2, "hp": 60 }
  ],
  "decor": [{ "kind": "tree", "x": 3, "y": 2, "scale": 1.2 }]
}
```

Weapon definition (excerpt):

```ts
const pistol: WeaponDef = {
  id: 'pistol', category: 'pistol', ammo: 15, fireMode: 'semi', fireIntervalTicks: 6,
  projectile: { kind: 'bullet', speed: 60, damage: 32, spreadDeg: 2 },
  recoil: { back: 0.5, up: 1.0 },           // Δv on shooter, m/s
  knockback: 2,                              // Δv on victim, m/s, along bullet direction
  thrownDamage: 55, dropWeight: 1.0, twoHanded: false,
  shape: { kind: 'pistol', length: 0.45 }, sound: 'shot.small',
};
```

## Appendix C. Weapon roster

Damage/ammo from community-compiled stats for the original; used as parity defaults. Rare = lower drop
weight. Milestone column shows when each lands (M3 core archetypes, M7 everything else).

| Category | Weapon | Damage | Ammo | Behavior notes | Kind | M |
| --- | --- | --- | --- | --- | --- | --- |
| Melee | Fists | 22 | ∞ | Default; forward self-impulse; disarms | melee | M2 |
| Pistols | Pistol | 32 | 15 | Low knockback, slight inaccuracy | bullet | M3 |
| Pistols | Revolver | 44 | 6 | High upward recoil; accurate if fired slowly | bullet | M3 |
| Pistols | Deagle | 56 | 15 | Very high knockback, high recoil | bullet | M7 |
| Pistols | Uzi | 14 | 40 | Auto, medium knockback | bullet | M3 |
| Pistols | God Pistol (rare) | 30–60 | ∞ | Big slow shots | bullet | M7 |
| Rifles | AK-47 | 23 | 30 | Auto | bullet | M3 |
| Rifles | M16 | 20 | 30 bursts | 3-round bursts | bullet | M7 |
| Rifles | M1 | 35 | 8 | Semi, medium knockback | bullet | M7 |
| Rifles | Sniper | 75 | 5 | Laser sight; headshot = kill at 100 HP | bullet | M3 |
| Rifles | Sawed-Off | 10–30 ×5 | 10 | Wide spread, very high backward recoil (boosting) | pellets | M3 |
| Rifles | Military Shotgun | 5–6 ×5 | 10 | Tight spread, medium recoil | pellets | M7 |
| Rifles | Bouncer | 45 | 30 | Bullets bounce 6× | bullet | M7 |
| Explosives | Grenade Launcher | 50–80 | 5 | Bouncing grenade, short fuse | grenade | M3 |
| Explosives | Thruster | 0 / 15 | 20 | Pushes target, then pops | rocket | M7 |
| Explosives | RPG (rare) | 300+ | 3 | Rocket, explode on contact, high recoil | rocket | M3 |
| Snake | Snake Gun | 5/bite | 6 | Snakes have player HP | creature | M7 |
| Snake | Snake Shotgun | 5/bite | 10 | 3 snakes per shot | creature | M7 |
| Snake | Snake Grenade Launcher | 5/bite | 5 | Grenade bursts into 4 snakes | burst-into | M7 |
| Snake | Snake Launcher | 25/bite | 3 | Giant snake, 2× HP | creature | M7 |
| Snake | Snake Minigun | 5/bite | 40 | Rapid snakes | creature | M7 |
| Snake | Flying Snake Launcher | 25/bite | 3 | Giant snake ignoring gravity | creature | M7 |
| Lava | Lava Spike Ball Gun | 20–40/spike | 5 | Ball splits into 25 spikes | burst-into | M7 |
| Lava | Lava Beam | 215 | 25 | Warning sight, then damaging beam | beam | M7 |
| Lava | Lava Stream | ~60/s | 10 s | Continuous beam, high knockback | beam | M7 |
| Lava | Lava Spray | 5–20 | 40 | Droplets, high knockback | grenade (no fuse) | M7 |
| Lava | Lava Spike Gun | 10–15 + 3×(5–10) | 25 | Shot spawns 3 spikes on impact | burst-into | M7 |
| Melee | Sword | 68 | ∞ | Stab + forward lunge | melee | M7 |
| Melee | Spear | 20 | ∞ | Long reach, high knockback, usable as mobile cover | melee | M7 |
| Melee | Blink Dagger | 22–50 | 25 | Teleport forward, damage at destination | melee | M7 |
| Other | Time Bubble | 12.5 / 200 | 5 | Freezes what it hits, then explodes | field | M7 |
| Other | Laser | 10 | 60 | Very high knockback; vanishes if knocked from hand | bullet | M7 |
| Other | Ice Gun | 7.7 | 40 | Slows | bullet + status | M7 |
| Other | Black Hole (rare) | ∞ | 1 | Expanding attractor, kills what it swallows | field | M7 |
| Other | Glue Gun | 5 | 40 | Pins players in place | field | M7 |
| Other | Minigun | 5 | 200 | Auto, backward recoil = jetpack | bullet | M7 |
| Other | Flamethrower | 5/s burn, 6 s | ~5 s | Ignites | field + status | M7 |

## Appendix D. Hazard catalog

| Type id | Behavior | Physics implementation | M |
| --- | --- | --- | --- |
| `solid` | Static geometry | Static body, box/polygon | M0 |
| `block.destructible` | HP; damaged by bullets/explosions; breaks into debris | Static body removed on death; debris = particles (+ optional short-lived dynamic chunks) | M3/M4 |
| `crate` | Pushable box; stacks topple (Desert) | Dynamic box, density 0.5, friction 0.5 | M4 |
| `spikes` | Instant kill on contact | Static sensor triangles on a solid base; `dir` up/down/left/right | M4 |
| `lava` | 35 dmg per touch with cooldown, upward knock; optional rise/sink over time | Static or kinematic sensor; surface y animated | M4 |
| `saw` | Rotating blade, instant kill; optional path | Kinematic circle with angular velocity; sensor fixture | M4 |
| `platform.moving` | Waypoint path, loop/pingpong; carries riders | Kinematic body; riders inherit velocity via friction + explicit carry | M4 |
| `platform.rotating` | Constant or oscillating rotation | Kinematic angular velocity (or dynamic + revolute motor when it should react to weight) | M4 |
| `platform.disappearing` | Timed solid/hidden cycle with warning blink | Toggle fixture mask; render blink | M4 |
| `platform.collapsing` | Falls after being stood on | Static → dynamic on trigger after delay | M4 |
| `platform.momentum` | Tilts/sinks under weight | Dynamic with prismatic/revolute joint and spring | M4 |
| `chain` | Hanging links; destructible; can carry a platform | Dynamic links + revolute joints; break joint on damage | M4 |
| `barrel.explosive` | Small HP; explodes 10–55 dmg by distance | Dynamic body → explosion | M4 |
| `laser` | Emitter with on/off timing, warning then beam; kills | Raycast each tick while on; render warning line | M4 |
| `conveyor` | Moves grounded bodies; ducking anchors | Contact tangent speed on the surface fixture | M4 |
| `ice` | Very low friction | Fixture friction 0.02 | M4 |
| `bounce` | Launch pad | High restitution + impulse on contact | M4 |
| `spikeball` | Swinging on chain, rolling, or dropping; instant kill | Dynamic circle + rope/revolute joint; sensor ring | M4 |
| `crusher` | Walls close in on timer; crush = kill when overlapping player | Kinematic bodies + overlap test | M4 |
| `trigger.drop` | Scripted weapon drop at time/position | Spawner hook | M4 |
| `void` | Out of bounds | Bounds check in rules (not a body) | M2 |
