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
- **Stack**: TypeScript + Vite; **Koota** ECS for all game state; **Planck.js** (a Box2D port — the same
  engine family Unity 2D, and therefore the original, is built on) for physics; **TypeGPU** (WebGPU) with
  `@typegpu/sdf` for a signed-distance-field renderer, plus a small Canvas 2D fallback/debug renderer;
  Web Audio synthesized SFX; plain DOM menus; Vitest + Playwright. **No binary assets**: stick figures,
  levels, and sounds are all procedural — every visible shape is an SDF.
- **Core architectural rule**: a DOM-free `sim/` package (a Koota world + systems) runs identically in the
  browser and in Node (headless tests, bots, and later an authoritative server). `render/` only reads
  from it. Every player — keyboard, gamepad, remote peer, or bot — is driven through one `PlayerInput`
  struct per tick.
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
4. Zero-install: runs from a static URL at 60 fps on integrated graphics in current desktop browsers
   with WebGPU; stays playable (plain look) through the Canvas 2D fallback where WebGPU is missing.
5. Agent/CI friendly: text-only assets, headless simulation, deterministic tests, one-command checks.

### Non-goals (v1)

- Steam features (Workshop, lobbies, achievements), consoles, native builds.
- Mobile/touch controls (the input model should not preclude them, but they are not designed for).
- Pixel-exact recreation of the original's levels, art, or audio (see [Legal / IP](#9-legal--ip)).
- Rollback/lockstep netcode. Online play is host-authoritative with interpolation (section 4.13).

### Principles

- **Feel over features.** Movement and hit reactions get tuned before more weapons are added.
- **Playable at the end of every milestone.** No milestone leaves the game unlaunchable.
- **Simulation is a library.** No `window`, `document`, or timers inside `src/sim`.
- **Data in traits, behavior in systems.** Game state is Koota traits; systems are plain functions run in
  a fixed order each tick. No gameplay logic in classes that own state.
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
| Look | flat colors, thick-lined stick figures, blood decals | SDF-rendered figures with smooth joints, outlines/glow, persistent decal texture; optional 2D lighting | M0 / M5 |
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

**Platform and physics**

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **TypeScript + Vite + Planck.js** | Runs from a URL; no asset pipeline; sim runs headless in Node; Box2D-quality joints/raycasts/CCD; small bundle; easy CI | Determinism only within one JS engine | **Chosen** |
| Phaser 3 (+ Matter.js) | Batteries included (input, scenes, tweens) | Matter's constraint solver is soft and jittery for ragdolls; fighting the framework once we bring our own physics and renderer | Rejected |
| Rapier 2D (WASM) | Very fast, cross-platform deterministic | Async WASM init, larger bundle; determinism only matters for lockstep, which we are not doing | Fallback if we ever need lockstep |
| Godot 4 | Great 2D physics, free, text scenes | Harder to test headless in this environment; export pipeline; not URL-shareable without extra work | Rejected for v1 |
| Unity | Closest to original | Binary assets and scenes, proprietary, unusable in headless agent/CI workflows | Rejected |

**Entity model**

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Koota** (pmndrs) | SoA trait stores; cached queries; tag traits; relations (`HeldBy`, `OwnedBy`, `PartOf`); `Added`/`Removed`/`Changed` modifiers that drive render-object lifecycle and network deltas; framework-agnostic core runs in Node | Pre-1.0 (0.6.x), README-level docs; iteration-order determinism must be verified; stores are plain arrays (pack to typed arrays for GPU upload) | **Chosen** |
| Plain classes + system functions | Zero dependencies, obvious | Hand-rolled queries, change tracking and serialization; every new entity type touches render and net code | Rejected |
| bitECS / miniplex | Fast (bitECS) or ergonomic (miniplex) | bitECS is numeric-only and awkward for object references; miniplex lacks relations and change tracking | Rejected |

**Renderer**

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **TypeGPU + `@typegpu/sdf` (WebGPU)** | Every shape in this game is a union of SDF primitives (disks, capsules, rounded boxes): resolution-independent anti-aliased lines, smooth-union joints, cheap glow/outline/soft shadow, thousands of particles for free; shaders are TypeScript (`'use gpu'`) with type-checked buffers; SDF functions are also callable on the CPU (unit-testable); `@typegpu/noise` for lava, `@typegpu/radiance-cascades` for optional 2D lighting | WebGPU gaps (Linux Firefox, macOS before Tahoe); pre-1.0 with breaking changes between minors (0.12 removed the old pipeline builder; encoders still under `~unstable`); headless CI needs SwiftShader flags and screenshots need a headed Xvfb run; harder to debug than Canvas | **Chosen, gated by the M0 spike** |
| Canvas 2D | Trivial, runs everywhere, easy to debug | Line-joint artifacts at thick widths, no cheap glow/lighting, particles and decals get CPU-bound | **Kept as fallback + debug renderer** |
| PixiJS / WebGL2 sprites | Mature, fast batching | Sprite-oriented; SDF look would need custom shaders anyway | Rejected |

The renderer sits behind one interface (`Renderer.render(frame: RenderFrame)`), where `RenderFrame` is a
plain description of shapes for this frame. The SDF renderer and the Canvas renderer both consume it; the
sim never knows which is active. WebGPU availability is probed at boot (`navigator.gpu?.requestAdapter()`
can return `null` even where `navigator.gpu` exists) and the fallback is chosen with a visible notice.

Supporting libraries (latest stable at scaffold time; versions pinned in `package.json`, not here):
`koota`, `planck`, `typegpu`, `@typegpu/sdf`, `@typegpu/noise`, `unplugin-typegpu` (Vite plugin that
compiles `'use gpu'` functions), optional `@typegpu/radiance-cascades`, `zod` (level/weapon schema
validation), `tweakpane` (debug tuning panel), `zzfx`-style synth (or hand-written Web Audio), `vitest`,
`@playwright/test`, `eslint` + `typescript-eslint`, `prettier`. Menus are plain DOM/TS; adopt Preact only
if the UI grows beyond a few screens. TypeGPU and Koota are pinned to exact versions and upgraded
deliberately with a changelog read; the `render/gpu/` adapter is the only place that touches TypeGPU APIs.

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
├── package.json, vite.config.ts (with unplugin-typegpu), tsconfig.json, eslint.config.js, .prettierrc
├── PLAN.md                    # this document
├── docs/                      # deep dives added as milestones land (netcode, level schema, ADRs)
├── public/                    # favicon, PWA manifest (no game assets)
├── src/
│   ├── main.ts                # bootstrap: renderer probe, loop, UI, input → Game
│   ├── core/                  # fixed-step loop, seeded RNG, math/vec, id allocator
│   ├── sim/                   # DOM-free simulation (browser + Node)
│   │   ├── world.ts           # createSimWorld(): Koota world + planck world; step(inputs) runs systems in order
│   │   ├── traits.ts          # every trait and relation (section 4.5)
│   │   ├── systems/           # one file per system, pure functions (world) => void
│   │   ├── tuning.ts          # every gameplay constant (Appendix A)
│   │   ├── input.ts           # PlayerInput type + helpers
│   │   ├── physics/           # collision categories, contact router, raycast helpers, body↔entity map
│   │   ├── player/            # controller, combat (punch/block), health, ragdoll construction
│   │   ├── weapons/           # defs table, weapon systems, projectiles, explosions
│   │   ├── hazards/           # one module per hazard type (Appendix D)
│   │   ├── level/             # zod schema, loader (JSON → entities + bodies), themes
│   │   ├── rules/             # round/match state machine, spawner, scoring
│   │   ├── ai/                # (M9) bots, snakes (M7)
│   │   └── snapshot.ts        # serialize/restore traits for net + late join
│   ├── render/
│   │   ├── frame.ts           # RenderFrame: plain shape lists built from sim traits (+ interpolation)
│   │   ├── figure.ts          # stick-figure pose → SDF primitives (procedural animation, secondary motion)
│   │   ├── camera.ts          # framing, zoom, shake
│   │   ├── fx/                # particles, decals, slow-mo/shake state (render-side Koota world)
│   │   ├── gpu/               # TypeGPU renderer: shaders ('use gpu'), buffers, passes, post FX
│   │   └── canvas/            # Canvas 2D fallback + debug draw (wireframes, hit zones, rays)
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
input devices ─┐                                   ┌─ render/ (RenderFrame → GPU SDF or Canvas)
gamepads ──────┼─▶ PlayerInput[4] ─▶ sim.step() ──▶ SimEvents ─┼─ audio/ (play SFX for events)
network peers ─┤        ▲          (Koota systems)              └─ net/ (host broadcasts snapshots)
bots ──────────┘        └── same struct for everyone
```

- `PlayerInput` (per player, per tick): `moveX ∈ [-1,1]`, `jump`, `down`, `attack`, `block`, `throw`
  (booleans, edge-detected inside the sim), `aimX/aimY` (unit vector in world space).
- `sim.step(inputs)` advances exactly one tick by running the system list in a fixed order (section 4.5)
  and returns the `SimEvents` emitted during the tick (hit, kill, shot, explosion, pickup,
  round-phase-change …). Render/audio/net consume events; they never reach into physics.
- The renderer builds a `RenderFrame` from sim traits (`Transform` + `PrevTransform` interpolated by the
  accumulator alpha) plus its own cosmetic state. Cosmetic state (particles, limb secondary motion,
  decals, shake) lives in a separate render-side Koota world keyed by sim entity id and is never
  replicated.

### 4.5 Entity model (Koota ECS)

All sim state is a Koota world. Entities are players, weapons, projectiles, ragdoll parts, hazards, level
solids, and a few singletons (world traits for the round/match state and the RNG). Systems are plain
functions `(world: World) => void`; `sim.step` calls them in this fixed order every tick:

```text
applyInputs → controller → combat (punch/block) → weapons (fire/throw/pickup) → projectiles (sweeps)
→ hazards (kinematics, sensors) → physics.step → syncTransforms (PhysBody → Transform, keep PrevTransform)
→ damage/death (Health ≤ 0 → ragdoll) → rules (round/match) → spawner → cleanup (Removed → destroy bodies)
→ collect events
```

**Traits** (representative, not exhaustive — `src/sim/traits.ts` is the source of truth):

| Trait | Data | Notes |
| --- | --- | --- |
| `Transform`, `PrevTransform` | `x, y, angle` | SoA; written only by `syncTransforms`; read by render and net |
| `PhysBody` | `{ body: planck.Body }` | Callback trait (object store); the only place physics handles live |
| `NetId` | `id: u16` | Explicit, never recycled within a round; entity ids are not sent over the wire |
| `Player` | `slot, color, inputIndex` | Tag-like identity |
| `Controller` | `grounded, wallDir, coyote, jumpBuffer, lockTicks, ducking, facing` | Section 4.7 |
| `Aim` | `x, y` | Unit vector |
| `Health` | `hp, maxHp` | Section 4.8 |
| `Combat` | `punchCooldown, blockMeter, blockStartTick, blocking` | Section 4.7 |
| `Weapon` | `defId, ammo, pickupCooldown, thrown` | Section 4.9 |
| `Projectile` | `kind, damage, speed, bounces, fuse` | Body-less bullets carry `x, y, vx, vy` here |
| `Hazard*` | per hazard type | e.g. `MovingPlatform { pathIndex, t }`, `Lava { surfaceY, rate }` |
| `RagdollPart` | `part` | Plus `PartOf(ragdollRoot)` relation |
| `Lifetime` | `ticksLeft` | Generic despawn |
| `Dead`, `Loose`, `Held`, `Static`, `Kinematic` | — | Tag traits used as query filters |

**Relations**: `HeldBy(player)` on a weapon (exclusive), `OwnedBy(player)` on projectiles and thrown
weapons (for kill credit and owner-collision grace), `PartOf(root)` for ragdoll parts and chain links
(with `autoDestroy: 'orphan'` so destroying the root destroys the parts), `StandingOn(entity)` for
platform carry.

**Why this matters beyond tidiness**

- Render-object lifecycle: `Added(PhysBody)` / `Removed(PhysBody)` queries create and destroy render-side
  state without the sim knowing the renderer exists.
- Networking: snapshots iterate SoA stores directly (`useStores`), and `Changed(Transform)` gives delta
  compression for free; `Added`/`Removed` on `NetId` become spawn/despawn events (section 4.13).
- Testing: a headless test is `createSimWorld({ level, seed })`, feed inputs, then query traits.

**Rules of use**

- Physics handles (`PhysBody`) never leave `sim/physics`; other systems read `Transform`/`Controller`.
- No per-entity closures in hot systems: define the `updateEach` handler once at module scope.
- Use `createQuery` once per system and reuse it (the README's recommended pattern).
- Iteration order must be deterministic for a fixed operation sequence; the golden determinism test in
  M0 pins this, and any Koota upgrade must keep it green.

### 4.6 Physics design

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

### 4.7 Character controller

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

### 4.8 Combat, health, rounds

- `Health` component: `hp`, `maxHp` (match setting), `takeDamage(amount, zone, source)` applies
  multipliers (head ×2, neck ×1.5), emits blood events scaled by damage, and kills at `hp ≤ 0`.
- Instant-kill sources bypass HP. Out-of-bounds check against the level's kill bounds every tick.
- Round state machine: `Loading → Countdown(3 s) → Fighting → LastKill(slow-mo 0.25× for ~1.2 s) →
  Scoreboard(optional) → Loading`. Draw when all remaining players die on the same tick.
- Match state: wins per player, crown on the leader, optional `firstTo` limit and optional win counter
  display; level rotation `random | ordered` with a no-immediate-repeat rule.
- Spawning: levels define ≥ 4 spawn points; assignment is shuffled by the sim RNG each round.

### 4.9 Weapons

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

### 4.10 Levels and hazards

- Levels are JSON (schema in [Appendix B](#appendix-b-data-formats)): bounds, kill bounds, spawn points,
  theme, drop settings, decorations (render-only), and a list of objects with `type` + typed props.
  Built-in levels are authored as typed TS modules so the compiler and zod both check them; the editor
  (M8) exports the same shape.
- Hazards are small modules registered by `type` string: `create(world, def)` builds bodies/joints,
  `step(tick)` drives kinematics, and contact callbacks apply effects. The catalog and physics
  implementation notes are in [Appendix D](#appendix-d-hazard-catalog).
- Themes define a palette (background, solids, accents, blood tint) and a decoration set; a level's look
  is `theme + geometry`, so theme changes are free.

### 4.11 Camera and rendering

**Camera**: fits all alive players plus padding, clamped to level bounds, with smoothed position/zoom;
minimum zoom always shows the whole arena. Screen shake from explosion/hit events; slow-mo scales the sim
step multiplier, not the render rate. The camera produces one uniform (view offset, zoom, pixels-per-meter)
shared by both renderers.

**RenderFrame**: the render layer turns sim traits into a flat list of *shape groups*. A group is a
bounding box plus 1–16 SDF primitives (`disk`, `capsule` = `sdLine` minus a radius, `roundedBox`,
`pie`, `bezier` from `@typegpu/sdf`, plus our own `triangle` for spikes, ported from Inigo Quilez's list)
with a color, a blend operator (`union` / `smoothUnion(k)`), and a layer.
Examples: a stick figure is one group (head disk + 9 capsules smooth-unioned at the joints — this is what
gives the blobby, hand-drawn look); a weapon is a group of 2–4 rounded boxes; each level solid is a group;
a bullet is a capsule; a particle is a disk. `figure.ts` owns the pose → primitives mapping (run cycle,
jump/fall/duck/wall-slide poses, aim arm, block arms, punch extension, spring/verlet secondary motion).

**SDF renderer (`render/gpu/`, TypeGPU)**

- **Instanced quads, not a full-screen scene SDF.** Groups are packed into two storage buffers per frame
  (`Group[]` with bounds/color/primitive range; `Primitive[]` as a fixed-size struct). One draw call per
  layer renders `groupCount` instances of a unit quad; the vertex stage expands the quad to the group's
  bounds and the fragment stage evaluates only that group's primitives with `@typegpu/sdf` helpers, then
  anti-aliases with a screen-space smoothstep (`fwidth`). Per-pixel cost is bounded by primitives per
  group, so hundreds of groups and thousands of particles are cheap.
- **Passes**: (1) background gradient + theme decorations (SDF groups with parallax offset);
  (2) decals — blood and scorch marks are drawn *once* into a persistent world-space texture per round
  and sampled thereafter, so decal count is unbounded at zero per-frame cost; (3) world layers in order:
  solids → hazards → weapons/projectiles → ragdolls → players → particles → world-space UI (crown, laser
  sights, block arc); (4) post: shake offset, slow-mo grade/vignette, hit-stop flash, black-hole UV
  distortion. Screen-space HUD and menus stay in the DOM.
- **Effects that come almost free from SDFs**: outlines (`|d| < w`), glow (`exp(-d)`), soft drop shadows
  (offset SDF), lava surface (rounded box with `@typegpu/noise` displacement of the sample point),
  saw teeth (`sdPie` repeated), destructible-block cracks (subtract capsules), smooth "merge" of a held
  weapon into the hand. **Stretch (M5)**: 2D global illumination with `@typegpu/radiance-cascades`, fed
  by a Jump Flood SDF texture of solids (`createJumpFlood`) with lava, muzzle flashes and explosions as
  emitters.
- **Shaders are TypeScript**: `'use gpu'` functions compiled by `unplugin-typegpu`, typed buffers via
  `d.struct`/`d.arrayOf`, pipelines via `root.createRenderPipeline`. The same SDF functions run on the
  CPU, so the primitive math has Vitest coverage and the Canvas fallback can reuse it for hit-testing.
- **Boot**: probe `navigator.gpu?.requestAdapter()`; on `null`, or on device loss, switch to the Canvas
  renderer and show a one-line notice. The player-facing feature set (gameplay, HUD) is identical; only
  looks differ.

**Canvas fallback + debug renderer (`render/canvas/`)**: consumes the same `RenderFrame`; draws groups as
round-capped strokes and filled shapes; also provides debug draw (physics wireframes, hit zones, raycasts,
contact points, entity ids) toggled with a key. Kept deliberately plain — polish work targets the SDF
renderer only.

### 4.12 Input

- Device → player assignment on a join screen ("press jump to join"): keyboard+mouse is one device;
  each gamepad is another. A second keyboard-only player is supported with aim = facing/arrow keys.
- Keyboard/mouse aim: `normalize(mouseWorld − playerPos)`. Gamepad aim: right stick, falling back to
  left stick direction when idle (dead zones and stick-release aim-hold in ticks).
- Remappable bindings stored in `localStorage`; Gamepad API polling each frame; input is sampled into
  `PlayerInput` at each sim tick (edge detection happens in the sim so replays/netcode work).

### 4.13 Networking (M6)

- **Model**: host-authoritative. The host runs the sim; clients send `PlayerInput` every tick over an
  unreliable/unordered channel with the last 3 inputs bundled for loss tolerance. The host broadcasts
  binary snapshots at 20 Hz; clients render with a ~100–150 ms interpolation buffer. Reliable ordered
  channel for events (round phases, spawns/despawns, level change, chat, settings).
- **Transport**: WebRTC DataChannels between peers, with a tiny signaling server (`server/`, Node + `ws`)
  that only exchanges SDP/ICE for a room code. Public STUN; TURN optional. Because `sim/` is DOM-free,
  the same code can later run as a **dedicated authoritative server** over WebSockets for players without
  a good host.
- **Replication**: players (position, velocity, aim, flags, hp, weapon id, ammo), dynamic bodies (loose
  weapons, projectile bodies, dynamic props, ragdoll parts) as quantized transforms keyed by `NetId`;
  bullets replicate as spawn events (their paths are deterministic). Snapshots are produced by iterating
  Koota stores (`useStores`) for the replicated traits; `Changed(Transform)` selects what goes into a
  delta snapshot and `Added`/`Removed` on `NetId` produce spawn/despawn events. Late joiners get a full
  snapshot. Budget: < 30 KB/s per client with 4 players.
- **Prediction**: none for v1 (matches the original's feel and avoids physics rollback). Local input
  latency mitigation later, if needed: predict only the local capsule's horizontal movement and jump.
- Prepared from M0: seeded RNG, tick-based timing, `PlayerInput` indirection, stable ids, snapshot API.

### 4.14 Bots (M9) and snakes (M7)

- Snakes: small AI bodies that pathfind trivially (move toward nearest player, hop), have HP scaled to
  the match HP, bite on contact, take head/neck multipliers.
- Bots: utility-scored actions (grab nearest weapon, approach/retreat, aim with noise, block when a
  bullet approaches, avoid hazards using short raycasts and level kill zones, jump/wall-jump heuristics).
  Bots are also the engine of headless soak tests.

### 4.15 Level editor (M8)

In-browser: object palette, grid snapping, drag/rotate/resize, property panel generated from each
hazard's zod schema, spawn points and drop range tools, one-click playtest, undo/redo, import/export
JSON, share via compressed URL hash, local library in IndexedDB, user levels selectable in match settings.

### 4.16 Debug tooling (from M1)

Tweakpane panel bound to `tuning.ts`; spawn-weapon/kill/slow-mo/free-camera cheats; physics overlay
(Canvas debug renderer drawn over the SDF frame); renderer switch (GPU ↔ Canvas) at runtime; frame/tick
timing HUD including GPU pass timings; entity/trait inspector for the sim world; state hash display for
determinism checks; input recorder that saves seed + inputs to a JSON replay.

---

## 5. Milestones

Sizes are relative engineering effort (S < M < L < XL) by number of subsystems touched and how invasive
the changes are. Each milestone lists its deliverables and acceptance criteria.

### M0 — Scaffold and renderer spike (M)

- Vite + TypeScript (`strict`) + `unplugin-typegpu`, ESLint + Prettier, Vitest, Playwright,
  `npm run check` (lint + typecheck + unit tests + build) as the single CI entry point; static deploy of
  `dist/`.
- `core/` fixed-step loop, seeded RNG, vec math; `sim/world.ts` = Koota world + Planck world with the
  system runner, `Transform`/`PrevTransform`/`PhysBody` traits and `syncTransforms`; a flat test level with
  falling boxes.
- `RenderFrame` + camera; Canvas renderer (debug draw included); **SDF renderer spike**: instanced SDF
  quads via TypeGPU drawing boxes and one static stick figure (smooth-unioned capsules), AA, one post
  pass. Measure frame time at 1080p with 500 groups on an integrated GPU and under SwiftShader in CI.
- CI: WebGPU smoke job with Chromium SwiftShader flags (`--enable-unsafe-webgpu --enable-features=Vulkan
  --use-angle=vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --disable-vulkan-surface`,
  `libvulkan1` + `mesa-vulkan-drivers` installed); screenshot job runs headed under Xvfb because headless
  Chromium captures WebGPU canvases as black.
- **Accept**: `npm run dev` shows boxes landing at 60 fps in both renderers; `npm run check` passes;
  a Vitest headless test steps the world 600 ticks and asserts rest; a golden state hash over 600 ticks
  with scripted spawns/destroys is stable across runs (pins Koota iteration order).
- **Go/no-go for the SDF renderer** (decided at the end of M0): go if the spike renders the stick figure
  and 500 groups under 4 ms GPU time on an integrated GPU and the CI job is green. No-go means the
  Canvas renderer becomes primary and the SDF renderer moves to an optional track; nothing else changes.

### M1 — Movement prototype (M)

- Player capsule controller (`Controller`, `Aim` traits + systems): run, jump (coyote/buffer), duck,
  wall slide + wall jump, punch self-impulse (punch jump / slam), block pose (no combat effect yet), aim
  from mouse and gamepad.
- `figure.ts`: procedural stick-figure pose → SDF primitives with secondary motion, rendered by both
  renderers; dynamic camera; tuning panel; input replay recorder.
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

- Blood particles + persistent decal texture, sparks, smoke, muzzle flashes, hit-stop, screen shake,
  kill slow-mo polish, camera tuning, crown/scoreboard art, theme decorations; SDF effects pass
  (outlines, glow, soft shadows, noise-displaced lava, black-hole distortion).
- Full SFX set and optional procedural music; audio mixer settings.
- Settings: HP, weapon/level toggles, win counter, first-to-N, input remapping, colorblind palette,
  reduce-shake/blood toggles, renderer selection. PWA manifest for offline play.
- Optional: physics arms on alive players if the feel review calls for it (see 4.6 upgrade path).
- Stretch: 2D lighting with `@typegpu/radiance-cascades` (lava, muzzle flashes and explosions as
  emitters), behind a settings toggle with a GPU-time budget check.
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

- Editor described in 4.15; user levels in IndexedDB; import/export/share; user levels in rotation.
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
  round/match state machine, input edge detection, snapshot round-trip, SDF primitive math (the
  `'use gpu'` functions are called on the CPU), `figure.ts` pose → primitives.
- **Headless sim tests (Vitest, Node)**: `createSimWorld({ level, seed })`, script `PlayerInput`
  sequences, assert trait values/events/tick counts (jump heights, wall-jump climb, bullet hit point,
  parry window, hazard effects). A **golden determinism test** runs a fixed seed + scripted inputs for
  600 ticks and compares a state hash; updating the hash must be a deliberate commit. This test also
  guards Koota upgrades (iteration order) and Planck upgrades.
- **Fuzz/soak**: random or bot inputs for tens of thousands of ticks; assert no exceptions, no NaN/Inf
  transforms, bounded entity counts, bounded physics step time.
- **E2E (Playwright, Chromium)**: two projects. *Logic* runs with the Canvas renderer in plain headless
  mode: boot → join → start local match vs bot → round ends. *GPU* runs with the SwiftShader WebGPU flags
  (section 5, M0) and asserts the SDF renderer initialised and drew frames (readback of a few pixels);
  screenshots and walkthrough recordings run headed under Xvfb. Gamepad emulation via injected
  `navigator.getGamepads`.
- **Performance budgets**: physics step ≤ 3 ms (4 alive + 3 ragdolls + 30 dynamic props); CPU frame build
  (`RenderFrame` + buffer packing) ≤ 1 ms; GPU time ≤ 4 ms at 1080p on an integrated GPU with 500 groups
  and 2 000 particles; initial bundle ≤ 700 KB gzip; SwiftShader smoke test only asserts correctness,
  never speed.
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
| WebGPU unavailable (Linux Firefox, macOS before Tahoe, blocklisted drivers, GPU-less VMs) | Game will not start for some players | Boot-time adapter probe; Canvas fallback renders the same `RenderFrame`; the fallback is exercised in CI on every PR |
| TypeGPU pre-1.0 churn (breaking changes between minors, `~unstable` encoder APIs) | Renderer breaks on upgrade | Exact version pins; all TypeGPU calls inside `render/gpu/`; upgrade in a dedicated PR with the GPU smoke test; Canvas renderer keeps the game shippable meanwhile |
| Koota pre-1.0 churn or non-deterministic iteration order | Sim refactors; replays and golden tests break | Exact version pin; systems only use `query`/`updateEach`/`useStores`/relations; golden determinism test in CI; thin `sim/world.ts` wrapper so a swap to another archetype ECS is contained |
| SDF renderer cost grows with primitives per pixel (many overlapping groups, huge zoom-out) | GPU frame drops | Groups are bounded to ≤ 16 primitives; per-layer instancing; particles as single-primitive groups; GPU timing in the debug HUD with a budget alarm; lighting is opt-in |
| Headless WebGPU in CI is flaky or slow | Red CI unrelated to code | SwiftShader job asserts correctness only, is allowed to retry once, and runs separately from the logic E2E which uses the Canvas renderer |
| IP/trademark issues | Takedown | Original name, art, sounds, level designs; mechanics only (section 9) |

---

## 8. Decisions log and open questions

### Decided (defaults this plan proceeds with)

1. Web/TypeScript stack with Planck.js physics. (4.1)
2. Koota ECS for all sim state; systems are plain functions in a fixed order; render-side cosmetic state
   lives in a separate Koota world. (4.5)
3. TypeGPU + `@typegpu/sdf` instanced-SDF renderer as the primary look, behind a `RenderFrame` interface,
   with a Canvas 2D fallback/debug renderer; the choice is confirmed by the M0 spike. (4.1, 4.11, M0)
4. Alive player = controlled capsule + cosmetic limbs; dead player = true ragdoll. (4.6)
5. Bullets are swept rays; explosives are bodies. (4.6, 4.9)
6. Local multiplayer before online; online is host-authoritative with interpolation, no rollback. (4.13)
7. Endless matches by default with an optional first-to-N, as a quality-of-life addition. (4.8)
8. Faithful quirks kept as tunables: ammo refills on pickup, empty weapon is flung. (4.9)
9. No binary assets; synthesized audio. (1)

### Open questions (answers change scope, defaults apply otherwise)

1. Is online play required for the first public release, or can it ship after local play? Default: after.
2. Faithful weapon roster and names vs. an original arsenal? Default: faithful mechanics, renamed where a
   name is distinctive (e.g. "God Pistol") before public release.
3. Desktop browsers only? Default: yes; touch controls are out of scope.
4. Level count target for release and whether the editor should come before online. Default: 60+, editor
   after online.
5. Is the Canvas fallback worth keeping past M0, or should the game be WebGPU-only with a clear "needs
   WebGPU" screen? Default: keep it — it doubles as the debug renderer and the CI logic-test renderer, so
   its marginal cost is small.
6. Should 2D lighting (radiance cascades) be a release feature or a toggle-off stretch goal? Default:
   stretch goal in M5.

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

Traits and a system (Koota; illustrative excerpt of `src/sim/traits.ts` and one system — exact option
names follow the pinned version):

```ts
import { trait, relation, createQuery, type World } from 'koota';
import type { Body } from 'planck';

export const Transform = trait({ x: 0, y: 0, angle: 0 });
export const PrevTransform = trait({ x: 0, y: 0, angle: 0 });
export const PhysBody = trait(() => ({ body: null as Body | null }));   // object store
export const Health = trait({ hp: 100, maxHp: 100 });
export const Weapon = trait({ defId: 0, ammo: 0, pickupCooldown: 0, thrown: false });
export const Dead = trait();                                            // tag
export const HeldBy = relation({ exclusive: true });
export const OwnedBy = relation();
export const PartOf = relation({ autoDestroy: 'orphan' });   // destroying the root destroys the parts

const bodies = createQuery(PhysBody, Transform, PrevTransform);        // created once, reused

export function syncTransforms(world: World) {
  world.query(bodies).updateEach(([phys, t, prev]) => {
    prev.x = t.x; prev.y = t.y; prev.angle = t.angle;
    const p = phys.body!.getPosition();
    t.x = p.x; t.y = p.y; t.angle = phys.body!.getAngle();
  });
}
```

SDF shape group (TypeGPU; illustrative — helper signatures follow the pinned `@typegpu/sdf` version; the
same function is unit-tested on the CPU):

```ts
import { tgpu, d, std } from 'typegpu';
import { sdDisk, sdLine, opSmoothUnion } from '@typegpu/sdf';

export const Primitive = d.struct({
  kind: d.u32,            // 0 disk, 1 capsule, 2 roundedBox, 3 triangle, 4 pie
  a: d.vec2f, b: d.vec2f, // endpoints / center+halfSize
  r: d.f32,               // radius / corner radius
});

// Distance of point p to one primitive; a group folds its primitives with opSmoothUnion(k).
export const primitiveSdf = tgpu.fn([Primitive, d.vec2f], d.f32)((prim, p) => {
  'use gpu';
  if (prim.kind === 0) return sdDisk(p - prim.a, prim.r);
  if (prim.kind === 1) return sdLine(p, prim.a, prim.b) - prim.r;   // capsule
  // ... other kinds
  return 1e9;
});

export const coverage = tgpu.fn([d.f32], d.f32)((dist) => {
  'use gpu';
  return 1 - std.smoothstep(-0.5, 0.5, dist / std.fwidth(dist));   // screen-space anti-aliasing
});
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
