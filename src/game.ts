import { Pane } from 'tweakpane';
import { attachBots } from './sim/ai/bots';
import { createFixedStepLoop, interpolationAlpha } from './core/loop';
import { createProfiler, formatStats, type StageStats } from './core/perf';
import { armFighters, makeStressRng, stressEvents } from './debug/stress';
import { createMixer } from './audio/mixer';
import { createKeyboardFallback } from './input/keyboard';
import {
  consumeLatch,
  createPadEdgeTracker,
  emptyLatch,
  isPadKey,
  padIndexOf,
  padKey,
  padLabel,
  pollGamepads,
  readPad,
  type Latch,
  type PadEdges,
  type PadEdgeTracker,
} from './input/gamepad';
import {
  assignColors,
  canStartMatch,
  clearSeats,
  collectPadMap,
  createMenuState,
  cycleSeatColor,
  maxBots,
  renderMenus,
  takeOrReadySeat,
  takeSeat,
} from './ui/menus';
import { activate, focusedIn, moveFocus, nudge, setFocus, defaultFocus, type NavDir } from './ui/padNav';
import { DEFAULT_MAP, loadMaps, saveMap } from './input/remap';
import { builtInMatchLevels, gymLevel, matchLevelPool } from './levels/catalog';
import { addShake, createCamera, worldToScreen } from './render/camera';
import { buildFrame } from './render/buildFrame';
import type { RenderFrame } from './render/frame';
import { createCanvasRenderer, type Renderer } from './render/canvas/renderer';
import { gpuFailureReason, tryCreateGpuRenderer } from './render/gpu/renderer';
import { createDecalLayerPool, snapDecalToSurface, type PersistentDecalLayer } from './render/fx/decals';
import { createParticles, emitFromEvents, stepParticles, type Decal } from './render/fx/particles';
import { blankInputs, EMPTY_INPUT, type PlayerInput } from './sim/input';
import { Bot, Combat, Dead, Health, Held, HeldBy, Loose, MatchState, Player, Projectile, RoundPhase, RoundState, Transform, Weapon } from './sim/traits';
import { WEAPON_BY_ID, weaponByIndex } from './sim/weapons/defs';
import { createSimWorld, type SimHandle } from './sim/world';
import { spawnWeapon } from './sim/systems/weapons';
import { tuning } from './sim/tuning';
import { loadSettings, saveSettings, type UserSettings } from './ui/settingsStore';
import { loadStats, recordKos, recordMatch } from './ui/statsStore';
import { packInput, unpackInput, type MatchRules, type MatchSlot, type NetMessage, type PackedInput } from './net/protocol';
import { connectRoom, RoomError, shareUrl, type RoomSession } from './net/room';
import { cleanPeerName, isRoomCode, MAX_PEERS, normalizeRoomCode, randomRoomCode } from './net/relay';
import { acceptFrames, checkHash, clientSteps, createOnlineMatch, HASH_EVERY_TICKS, pacingScale, type OnlineMatch } from './net/online';
import { restoreWorld } from './sim/snapshot';
import { createEditorState, fromHash, loadLibrary, type EditorState } from './editor/editor';
import { mountEditor } from './editor/view';
import { createRecorder } from './input/replay';
import { parseLevel, type LevelDef } from './sim/level/schema';
import { createTelemetry, privacySignalOptOut } from './telemetry/client';
import { describeDevice } from './telemetry/device';
import { createPerfAggregator } from './telemetry/perf';
import type { GameMode, MatchOutcome, MatchRole } from './telemetry/schema';

export type Game = {
  start: () => Promise<void>;
  stop: () => void;
};

type FloppyDebug = {
  rendererKind: 'gpu' | 'canvas';
  lastHash: string;
  tick: number;
  /** The room this browser is in and how its mirror of the match is doing; null when offline. */
  online: {
    code: string;
    role: 'host' | 'client';
    peerId: number;
    peers: number;
    rtt: number;
    inMatch: boolean;
    localSlot: number;
    buffered: number;
    lastHashOk: number;
    desync: boolean;
    bytesOut: number;
  } | null;
  countdown: number;
  physicsMs: number;
  gpuMs: number;
  /** Backing-store pixels and the dynamic resolution scale the renderer settled on. */
  resolution: { w: number; h: number; scale: number };
  phase: number;
  /** Screen-space player positions (CSS px) for automation and debugging. */
  players: {
    slot: number;
    color: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    hp: number;
    dead: boolean;
    blocking: boolean;
    weapon: string | null;
    bot: Record<string, number> | null;
  }[];
  /** Loose weapons lying around, for checking what bots are trying to fetch. */
  loose: { x: number; y: number; id: string; cooldown: number }[];
  forceLastStand: () => void;
  /** Puts a weapon straight into a fighter's hands (browser tests and manual checks of a specific gun). */
  giveWeapon: (slot: number, id: string) => void;
  freeze: (on: boolean) => void;
  stepTicks: (n: number) => void;
  /** Per-stage frame timings (ms) over the last few seconds: input, sim, fx, build, render, hud, frame. */
  perf: () => Record<string, StageStats>;
  /** rAF gaps over 12 ms seen during play since the page loaded (missed frames at 120 Hz). */
  longFrames: number;
  /**
   * The first 64 long frames: when, how long the gap was, the stage breakdown of the frame before it,
   * and the JS heap (MB, Chrome only) on either side of the gap; a drop means a major GC ran in it.
   */
  longFrameLog: { at: number; interval: number; tick: number; before: Record<string, number>; heapBefore: number; heapAfter: number }[];
  /** Per-stage cost of every frame in which the sim swapped arenas: the one frame that does a level's worth of setup. */
  rotationLog: { tick: number; level: string; stages: Record<string, number> }[];
  /** The most recent RenderFrame handed to the renderer (group/pixel accounting from the console). */
  lastFrame: () => RenderFrame | null;
  /** Stress scene: keep at least `target` particles alive and every fighter armed (0 turns it off). */
  stress: (target: number) => void;
};

type FloppyLauncher = {
  /** Start a deterministic solo match from anywhere (menu included); returns the level id used. */
  startMatch: (opts?: { level?: string; seed?: number; bots?: number; humans?: number; firstTo?: number }) => string;
  /** Drop a loose weapon into the running sim (defaults to just above player 1). */
  spawnWeapon: (id: string, x?: number, y?: number) => boolean;
  /** Put a weapon straight into a player's hands. */
  giveWeapon: (slot: number, id: string) => boolean;
  /** Every weapon id in the roster, for galleries and sweeps. */
  weaponIds: () => string[];
  /** Hold an input override for a slot for the next N sim ticks (merged over live input). */
  scriptInput: (slot: number, input: Partial<PlayerInput>, ticks: number) => void;
  /** Drop a fighter at a world position, at rest. */
  teleport: (slot: number, x: number, y: number) => boolean;
  /** Live projectile list for inspection: kind, phase, fuse, position. */
  projectiles: () => { kind: number; phase: number; fuse: number; x: number; y: number; defId: number }[];
  /** Stress scene (see FloppyDebug.stress); available before a match starts. */
  stress: (target: number) => void;
};

declare global {
  interface Window {
    __floppy?: FloppyDebug;
    __floppyLaunch?: FloppyLauncher;
  }
}

/** Used JS heap in MB from Chrome's non-standard `performance.memory`, 0 elsewhere. */
function usedHeapMb(): number {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
}

export function createGame(root: HTMLElement): Game {
  let canvas = root.querySelector('#game') as HTMLCanvasElement;
  const menusEl = root.querySelector('#menus') as HTMLElement;
  // A canvas element can only ever own one context type ('2d' or 'webgpu'), so
  // each renderer is created against its own element and the winner is swapped
  // into the DOM under the same id/class.
  function adoptCanvas(next: HTMLCanvasElement) {
    if (next === canvas) return;
    next.id = canvas.id;
    next.className = canvas.className;
    canvas.replaceWith(next);
    sizeObserver?.unobserve(canvas);
    canvas = next;
    sizeObserver?.observe(canvas);
    measureCanvas();
  }
  /**
   * CSS size of the canvas. Kept current by a ResizeObserver rather than read from `clientWidth` every
   * frame: a layout read inside the frame forces a synchronous layout whenever a HUD transition has
   * dirtied the tree, which is most frames of a real fight.
   */
  const view = { w: 1280, h: 720 };
  let viewDirty = true;
  let lastDpr = window.devicePixelRatio || 1;
  function measureCanvas() {
    view.w = canvas.clientWidth || 1280;
    view.h = canvas.clientHeight || 720;
    viewDirty = true;
  }
  const sizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            const box = entry.contentBoxSize?.[0];
            if (box && entry.target === canvas) {
              view.w = Math.round(box.inlineSize) || 1280;
              view.h = Math.round(box.blockSize) || 720;
              viewDirty = true;
            } else if (entry.target === canvas) {
              measureCanvas();
            }
          }
        })
      : null;
  sizeObserver?.observe(canvas);
  measureCanvas();
  const hudEl = root.querySelector('#hud') as HTMLElement;
  const settings: UserSettings = loadSettings();
  const menus = createMenuState();
  menus.maxHp = settings.maxHp;
  menus.firstTo = settings.firstTo;
  const keys = createKeyboardFallback();
  const mixer = createMixer();
  mixer.sfx = settings.sfx;
  mixer.music = settings.music;
  const loop = createFixedStepLoop(tuning.tickRate);
  const latches: Latch[] = [emptyLatch(), emptyLatch(), emptyLatch(), emptyLatch()];
  // Last accepted right-stick vector per pad, for the release-transient filter ({0,0} = at rest).
  const lastAim: { x: number; y: number }[] = [];
  const padEdges: PadEdgeTracker[] = [];
  /**
   * Which device drives each fighter slot in the running match ('keyboard' or 'pad:<index>'),
   * fixed when the match starts from the seats people took. Empty outside a match (and for
   * matches launched from the editor / debug hooks), in which case slot k falls back to pad k,
   * or the keyboard for slot 0 when no pad sits there.
   */
  let slotDevices: string[] = [];
  /** The last device that pressed a menu control: "Solo vs Bots" seats whoever chose it. */
  let lastMenuDevice = 'keyboard';
  let renderer: Renderer | null = null;
  let rendererKind: 'gpu' | 'canvas' = 'canvas';
  let sim: SimHandle | null = null;
  let cam = createCamera(gymLevel.bounds);
  const particles = createParticles();
  const decals: Decal[] = [];
  // Decal textures are recycled across level swaps (match and attract mode share the pool).
  const decalPool = createDecalLayerPool();
  let decalLayer: PersistentDecalLayer = decalPool.acquire(gymLevel.bounds);
  let renderedLevel: LevelDef = gymLevel;
  let raf = 0;
  let last = performance.now();
  let paused = false;
  let editor: EditorState | null = null;
  let pane: Pane | null = null;
  let extraLevels: LevelDef[] = [];
  let debugHud = false;
  let debugDraw = false;
  let freezeCam = false;
  let humanCount = 1;
  /** The relay connection while in an online room (lobby or match). */
  let room: RoomSession | null = null;
  /** Bookkeeping for the online match this browser is part of (host or client). */
  let online: OnlineMatch | null = null;
  let pingTimer = 0;
  const NAME_KEY = 'floppy-clash.name';
  menus.lobby.name = cleanPeerName(localStorage.getItem(NAME_KEY), '');
  const slotName = (slot: number) => online?.names[slot] ?? (slot >= humanCount ? `Bot ${slot + 1}` : `P${slot + 1}`);
  // Debug: hold the sim still (rendering continues) and single-step it from the console.
  let frozen = false;
  let frozenSteps = 0;
  let recorder = createRecorder(0, 'gym');
  let maps = loadMaps();
  let hitStop = 0;
  let stats = loadStats();
  // Where each frame's time goes (F3 overlay, window.__floppy.perf()), and the stress scene that
  // keeps the battlefield busy for profiling: `?stress=600` or __floppy.stress(600).
  const profiler = createProfiler(240);
  let longFrames = 0;
  const longFrameLog: FloppyDebug['longFrameLog'] = [];
  const rotationLog: FloppyDebug['rotationLog'] = [];
  let rotatedThisFrame = false;
  let lastHeap = 0;
  let lastFrame: RenderFrame | null = null;
  /** Canvas CSS size, sampled once per frame. */
  // The #hud element starts visible in the markup; `null` forces the first frame to set it.
  let hudShown: boolean | null = null;
  let stressTarget = Number(new URLSearchParams(window.location.search).get('stress') ?? 0) || 0;
  const stressRng = makeStressRng();

  // -----------------------------------------------------------------------------------------------
  // Telemetry: anonymous usage and frame-pacing statistics, batched to the Worker (src/telemetry,
  // worker/telemetry.ts) and read back on /stats. Everything below is fire-and-forget; the settings
  // toggle and the browser's Global Privacy Control signal both switch it off.
  const telemetry = createTelemetry({
    enabled: settings.telemetry && !privacySignalOptOut(),
    ctx: describeDevice(),
    context: () => ({ context: tracked ? tracked.mode : 'menu', renderer: rendererKind }),
  });
  const perfAgg = createPerfAggregator();
  /** How often a perf summary goes out during a long match (endless mode never "ends"). */
  const PERF_EVERY_MS = 60_000;
  /** The match this browser is currently reporting on; null between matches. */
  let tracked: {
    mode: GameMode;
    role: MatchRole;
    level: string;
    humans: number;
    bots: number;
    firstTo: number;
    maxHp: number;
    startedAt: number;
    lastPerfAt: number;
    kills: number;
    resyncs: number;
    longFramesAt: number;
  } | null = null;

  function trackMatchStart(level: LevelDef, humans: number, bots: number, firstTo: number, maxHp: number) {
    // A match started over a running one (rematch, editor playtest) ends the old one first.
    if (tracked) trackMatchEnd('restarted');
    const now = performance.now();
    const builtIn = builtInMatchLevels().some((l) => l.id === level.id) || level.id === gymLevel.id;
    tracked = {
      mode: online ? 'online' : humans === 1 && bots > 0 ? 'solo' : 'local',
      role: online ? online.role : 'offline',
      level: builtIn ? level.id : 'custom',
      humans,
      bots,
      firstTo,
      maxHp,
      startedAt: now,
      lastPerfAt: now,
      kills: 0,
      resyncs: 0,
      longFramesAt: longFrames,
    };
    perfAgg.reset();
    telemetry.match({ phase: 'start', ...matchFields(), seconds: 0, rounds: 0, kills: 0, won: false, longFrames: 0 });
  }

  /** Close the tracked match; `won` only means anything for a match the rules finished. */
  function trackMatchEnd(outcome: MatchOutcome, won = false) {
    if (!tracked) return;
    const t = tracked;
    telemetry.match({
      phase: 'end',
      ...matchFields(),
      outcome,
      seconds: Math.round((performance.now() - t.startedAt) / 1000),
      rounds: sim?.ecs.get(MatchState)?.round ?? 0,
      kills: t.kills,
      won,
      longFrames: Math.max(0, longFrames - t.longFramesAt),
    });
    flushPerf('end');
    tracked = null;
  }

  function matchFields() {
    const t = tracked!;
    return { mode: t.mode, role: t.role, level: t.level, renderer: rendererKind, humans: t.humans, bots: t.bots, firstTo: t.firstTo, maxHp: t.maxHp };
  }

  /** Ship the frame-pacing summary gathered since the last one; a second of frames is the minimum worth sending. */
  function flushPerf(reason: 'periodic' | 'end') {
    const s = perfAgg.summary();
    perfAgg.reset();
    if (!tracked) return;
    tracked.lastPerfAt = performance.now();
    if (!s || s.frames < 60) return;
    telemetry.perf({
      mode: tracked.mode,
      role: tracked.role,
      renderer: rendererKind,
      reason,
      lighting: settings.lighting,
      frames: s.frames,
      seconds: s.seconds,
      p50: s.p50,
      p95: s.p95,
      p99: s.p99,
      max: s.max,
      long12: s.long12,
      long20: s.long20,
      long50: s.long50,
      sim: s.stages.sim ?? 0,
      build: s.stages.build ?? 0,
      render: s.stages.render ?? 0,
      gpu: s.stages.gpu ?? 0,
      particles: s.stages.particles ?? 0,
      resScale: renderer?.resolutionScale ?? 1,
      players: tracked.humans + tracked.bots,
      rtt: room?.rtt ?? 0,
      desyncs: tracked.resyncs,
      heap: usedHeapMb(),
    });
  }

  // Attract mode: a bots-only brawl plays behind the menus so the title screen is never a dead panel.
  let demo: SimHandle | null = null;
  let demoCam = createCamera(gymLevel.bounds);
  const demoParticles = createParticles(2048);
  const demoDecals: Decal[] = [];
  let demoDecalLayer: PersistentDecalLayer = decalPool.acquire(gymLevel.bounds);
  let demoLevel: LevelDef = gymLevel;
  const demoLoop = createFixedStepLoop(tuning.tickRate);
  const DEMO_SCREENS = new Set(['menu', 'join', 'settings', 'lobby']);
  /** `--hp` values for 0..100 %, pre-stringified so a health tick allocates nothing. */
  const HP_SCALE = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));

  function startDemo() {
    const pool = matchLevelPool('all');
    const level = pool[Math.floor(Math.random() * pool.length)] ?? gymLevel;
    demo?.destroy();
    demo = createSimWorld({
      level,
      seed: (Math.random() * 1e9) | 0,
      settings: { playerCount: 0, bots: 4, maxHp: 100, firstTo: 0, showWins: false },
    });
    attachBots(demo.ecs, [0, 1, 2, 3]);
    demoCam = createCamera(level.bounds);
    demoParticles.clear();
    demoDecals.length = 0;
    decalPool.release(demoDecalLayer);
    demoDecalLayer = decalPool.acquire(level.bounds);
    demoLevel = level;
  }

  function stopDemo() {
    demo?.destroy();
    demo = null;
  }

  function stepDemo(dt: number) {
    if (!demo) startDemo();
    const world = demo!;
    const scale = world.ecs.get(RoundState)?.phase === RoundPhase.LastKill ? tuning.lastKillSlowmo : 1;
    const steps = demoLoop.consume(dt, scale);
    for (let i = 0; i < steps; i++) {
      const events = world.step(blankInputs(4));
      if (world.ctx.level !== demoLevel) {
        demoLevel = world.ctx.level;
        demoParticles.clear();
        demoDecals.length = 0;
        decalPool.release(demoDecalLayer);
        demoDecalLayer = decalPool.acquire(demoLevel.bounds);
      }
      emitFromEvents(events, demoParticles, demoDecals);
      demoDecalLayer.stampNew(demoDecals, (d) => (!settings.reduceBlood || d.kind === 'scorch') && snapDecalToSurface(world.ecs, d));
      demoDecals.length = 0;
      demoDecalLayer.consumed = 0;
    }
    stepParticles(demoParticles, dt);
    const frame = buildFrame(world, demoCam, interpolationAlpha(demoLoop), view.w, view.h, settings.reduceBlood ? null : demoParticles, {
      colorblind: settings.colorblind,
      decalLayer: demoDecalLayer,
      dt: dt * scale,
    });
    renderer?.render(frame);
  }

  function show() {
    // Re-rendering replaces every node; if a pad / arrow-key cursor was on a control, put it back
    // on the same control (by id, else by label) so the cursor does not vanish on each state change.
    const prev = menusEl.querySelector<HTMLElement>('.pad-focus');
    const prevKey = prev ? (prev.id ? `#${prev.id}` : prev.textContent?.trim() ?? '') : '';
    const prevScreen = menusEl.querySelector('.menu-wrap')?.className ?? '';
    renderMenus(
      menusEl,
      menus,
      {
        local: () => {
          clearSeats(menus.seats);
          menus.screen = 'join';
          menus.bots = 0;
          show();
        },
        bots: () => {
          // Seat whoever pressed the button (pad or keyboard), readied, with a full table of bots:
          // one more press of Start and the match is on.
          clearSeats(menus.seats);
          const seat = takeOrReadySeat(menus.seats, lastMenuDevice, deviceLabel(lastMenuDevice));
          if (seat) seat.ready = true;
          menus.screen = 'join';
          menus.bots = 3;
          show();
        },
        cycleBots: () => {
          const cap = room ? Math.max(0, MAX_PEERS - room.peers.size) : maxBots(menus.seats);
          menus.bots = cap > 0 ? (menus.bots + 1) % (cap + 1) : 0;
          if (room?.role === 'host') broadcastLobby();
          show();
        },
        online: () => {
          menus.screen = 'lobby';
          show();
        },
        editor: () => openEditor(),
        settings: () => {
          menus.screen = 'settings';
          show();
        },
        start: () => startIfReady(),
        back: () => {
          menus.screen = 'menu';
          show();
        },
        save: () => {
          saveSettings(settings);
          menus.maxHp = settings.maxHp;
          menus.firstTo = settings.firstTo;
          mixer.sfx = settings.sfx;
          mixer.music = settings.music;
          telemetry.setEnabled(settings.telemetry && !privacySignalOptOut());
          menus.screen = 'menu';
          show();
        },
        saveRemap: () => {
          const { padId, map } = collectPadMap(menusEl);
          saveMap(padId, map);
          maps = loadMaps();
          menus.notice = `Saved remap for ${padId}`;
          show();
        },
        resume: () => setPaused(false),
        quit: () => quitToMenu(),
        host: () => void joinOnline('host'),
        joinRoom: () => void joinOnline('client'),
        leave: () => leaveRoom(),
        startOnline: () => void startOnlineMatch(),
        lobbyChanged: () => {
          localStorage.setItem(NAME_KEY, menus.lobby.name);
          if (room?.role === 'host') broadcastLobby();
        },
        copyLink: () => {
          const url = menus.lobby.shareUrl;
          if (!url) return;
          void navigator.clipboard?.writeText(url).then(
            () => {
              menus.notice = 'Invite link copied.';
              show();
            },
            () => undefined,
          );
        },
        chat: (text?: string) => {
          if (!text || !room) return;
          const from = menus.lobby.name || 'you';
          pushChat(`${from}: ${text}`);
          const msg: NetMessage = { t: 'chat', from, text };
          if (room.role === 'host') room.send('all', msg);
          else room.send('host', msg);
          show();
        },
      },
      settings,
      maps,
      stats,
    );
    if (prevKey && menusEl.querySelector('.menu-wrap')?.className === prevScreen) {
      const again = prevKey.startsWith('#')
        ? menusEl.querySelector<HTMLElement>(prevKey)
        : [...menusEl.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === prevKey);
      if (again) setFocus(menusEl, again);
    }
  }

  function openEditor() {
    stopDemo();
    editor = createEditorState();
    const hash = location.hash.startsWith('#l=') ? location.hash.slice(3) : '';
    if (hash) {
      const loaded = fromHash(hash);
      if (loaded) editor.level = loaded;
    }
    menus.screen = 'editor';
    mountEditor(menusEl, editor, {
      playtest: (level) => startSim(level, { playerCount: 1, bots: 1 }),
      back: () => {
        menus.screen = 'menu';
        editor = null;
        show();
      },
    });
  }

  let matchStarting = false;
  async function beginMatch() {
    // Start and Enter both land here; the level library load is async, so guard against a
    // double press spawning two sims.
    if (matchStarting) return;
    matchStarting = true;
    try {
      const taken = menus.seats.filter((s) => s.taken);
      const humans = Math.max(1, taken.length);
      const bots = Math.min(menus.bots, maxBots(menus.seats));
      extraLevels = settings.includeUserLevels ? await loadLibrary().catch(() => []) : [];
      const pool = matchLevelPool(settings.enabledLevels, extraLevels);
      const level =
        settings.rotation === 'ordered'
          ? (pool[0] ?? gymLevel)
          : (pool[Math.floor(Math.random() * pool.length)] ?? gymLevel);
      startSim(level, {
        playerCount: humans,
        bots,
        maxHp: settings.maxHp,
        firstTo: settings.firstTo,
        devices: taken.length ? taken.map((s) => s.padId) : ['keyboard'],
        colors: assignColors(menus.seats, humans + bots),
      });
    } finally {
      matchStarting = false;
    }
  }

  function startIfReady() {
    if (!canStartMatch(menus.seats)) {
      menus.notice = 'Join and press A / Space again to ready, then Start.';
      show();
      return;
    }
    void beginMatch();
  }

  function deviceLabel(device: string): string {
    if (device === 'keyboard') return 'Keyboard';
    const pad = pollGamepads()[padIndexOf(device)];
    return pad ? padLabel(pad) : 'Pad';
  }

  function matchIsOver(): boolean {
    return !!sim && menus.screen === 'play' && sim.ecs.get(RoundState)?.phase === RoundPhase.MatchOver;
  }

  /** Same seats, same rules, fresh arena and seed: the "play again" the match-over card promises. */
  function rematch() {
    if (!sim) return;
    if (online) {
      // Only the host deals the next match; clients wait for its start message.
      if (online.role === 'host') void startOnlineMatch();
      return;
    }
    const bots = sim.players().filter((p) => p.has(Bot)).length;
    const ms = sim.ecs.get(MatchState);
    const colors = sim.players().map((p) => p.get(Player)?.color ?? 0);
    const pool = matchLevelPool(settings.enabledLevels, extraLevels);
    const level = settings.rotation === 'ordered' ? (pool[0] ?? gymLevel) : (pool[Math.floor(Math.random() * pool.length)] ?? gymLevel);
    startSim(level, { playerCount: humanCount, bots, maxHp: ms?.maxHp, firstTo: ms?.firstTo, devices: slotDevices, colors });
  }

  type StartOpts = {
    playerCount: number;
    bots: number;
    maxHp?: number;
    firstTo?: number;
    seed?: number;
    /** Input device per human slot; omitted for editor / debug launches (slot k <- pad k, or the keyboard). */
    devices?: string[];
    colors?: number[];
    /** Online: the host's rules, so every mirror of the match is created identically. */
    rules?: MatchRules;
  };

  function startSim(level: LevelDef, opts: StartOpts) {
    mixer.resume();
    mixer.startMusic();
    const seed = opts.seed ?? (Math.random() * 1e9) | 0;
    humanCount = opts.playerCount;
    slotDevices = opts.devices ? opts.devices.slice(0, Math.max(opts.playerCount, opts.devices.length)) : [];
    recorder = createRecorder(seed, level.id);
    stopDemo();
    sim?.destroy();
    const rules = opts.rules;
    sim = createSimWorld({
      level,
      seed,
      extraLevels,
      settings: {
        playerCount: opts.playerCount,
        bots: opts.bots,
        maxHp: opts.maxHp ?? rules?.maxHp ?? settings.maxHp,
        firstTo: opts.firstTo ?? rules?.firstTo ?? settings.firstTo,
        enabledWeapons: rules?.enabledWeapons ?? settings.enabledWeapons,
        enabledLevels: rules?.enabledLevels ?? settings.enabledLevels,
        rotation: rules?.rotation ?? settings.rotation,
        showWins: rules?.showWins ?? settings.showWins,
        colors: opts.colors,
      },
    });
    if (opts.bots > 0) {
      const botSlots: number[] = [];
      sim.ecs.query(Player).updateEach(([p]) => {
        if (p.slot >= opts.playerCount) botSlots.push(p.slot);
      });
      attachBots(sim.ecs, botSlots);
    }
    cam = createCamera(level.bounds);
    particles.clear();
    decals.length = 0;
    decalPool.release(decalLayer);
    decalLayer = decalPool.acquire(level.bounds);
    renderedLevel = level;
    resetBanner();
    paused = false;
    hitStop = 0;
    menus.screen = 'play';
    show();
    const ms = sim.ecs.get(MatchState);
    trackMatchStart(level, opts.playerCount, opts.bots, ms?.firstTo ?? opts.firstTo ?? settings.firstTo, ms?.maxHp ?? opts.maxHp ?? settings.maxHp);
  }

  // Debug/automation: per-slot input overrides that hold for a number of sim ticks, so browser
  // tests can drive a fighter deterministically regardless of frame pacing.
  const scripted: { input: Partial<PlayerInput>; ticks: number }[] = [];
  function applyScriptedInputs(live: PlayerInput[]): PlayerInput[] {
    if (!scripted.some((s) => s && s.ticks > 0)) return live;
    return live.map((input, slot) => {
      const s = scripted[slot];
      if (!s || s.ticks <= 0) return input;
      s.ticks -= 1;
      return { ...input, ...s.input };
    });
  }

  // Inspection surface for browser tests and the console. Built once; the live fields are getters
  // that read the sim on demand, so an idle page does not pay for entity queries every frame.
  const debugApi: FloppyDebug = {
    get rendererKind() {
      return rendererKind;
    },
    get lastHash() {
      return sim?.hash() ?? '';
    },
    get tick() {
      return sim?.ctx.tick ?? 0;
    },
    get online() {
      if (!room) return null;
      return {
        code: room.code,
        role: room.role,
        peerId: room.id,
        peers: room.peers.size,
        rtt: room.rtt,
        inMatch: !!online,
        localSlot: online?.localSlot ?? -1,
        buffered: online?.inbox.length ?? 0,
        lastHashOk: online?.lastHashOk ?? 0,
        desync: online?.desync ?? false,
        bytesOut: room.bytesOut,
      };
    },
    get countdown() {
      return lastFrame?.hud.countdown ?? 0;
    },
    get physicsMs() {
      return sim?.ctx.lastPhysicsMs ?? 0;
    },
    get gpuMs() {
      return renderer?.lastGpuMs ?? 0;
    },
    get resolution() {
      return { w: renderer?.canvas.width ?? 0, h: renderer?.canvas.height ?? 0, scale: renderer?.resolutionScale ?? 1 };
    },
    get phase() {
      return sim?.ecs.get(RoundState)?.phase ?? 0;
    },
    get players() {
      if (!sim) return [];
      const ecs = sim.ecs;
      const viewW = canvas.clientWidth || 1280;
      const viewH = canvas.clientHeight || 720;
      return sim.players().map((e) => {
        const t = e.get(Transform) ?? { x: 0, y: 0, angle: 0 };
        const s = worldToScreen(cam, t.x, t.y, viewW, viewH);
        let weapon: string | null = null;
        for (const w of ecs.query(Weapon, Held)) {
          if (w.targetFor(HeldBy) === e) weapon = weaponByIndex(w.get(Weapon)!.defId).id;
        }
        const bot = e.get(Bot);
        return {
          slot: e.get(Player)?.slot ?? 0,
          color: e.get(Player)?.color ?? 0,
          x: t.x,
          y: t.y,
          sx: s.x,
          sy: s.y,
          hp: e.get(Health)?.hp ?? 0,
          dead: e.has(Dead),
          blocking: e.get(Combat)?.blocking ?? false,
          weapon,
          bot: bot ? { mode: bot.mode, target: bot.target, surf: bot.surf, detour: bot.detour, timer: bot.timer } : null,
        };
      });
    },
    get loose() {
      if (!sim) return [];
      return sim.ecs.query(Weapon, Loose, Transform).map((w) => {
        const wt = w.get(Transform)!;
        const wep = w.get(Weapon)!;
        return { x: wt.x, y: wt.y, id: weaponByIndex(wep.defId).id, cooldown: wep.pickupCooldown };
      });
    },
    forceLastStand: () => {
      if (!sim) return;
      sim.players().forEach((p) => {
        const slot = p.get(Player)?.slot ?? 0;
        if (slot !== 0) p.set(Health, { hp: 0, maxHp: p.get(Health)?.maxHp ?? 100 });
      });
    },
    giveWeapon: (slot, id) => {
      if (!sim) return;
      const p = sim.players().find((e) => e.get(Player)?.slot === slot);
      const t = p?.get(Transform);
      if (!p || !t) return;
      for (const w of sim.ecs.query(Weapon, Held)) {
        if (w.targetFor(HeldBy) === p) sim.ctx.pendingDestroy.push(w);
      }
      spawnWeapon(sim.ecs, id, t.x, t.y, false).add(Held(), HeldBy(p));
    },
    freeze: (on) => {
      frozen = on;
      frozenSteps = 0;
    },
    stepTicks: (n) => {
      frozenSteps += Math.max(0, n | 0);
    },
    perf: () => profiler.stats(),
    get longFrames() {
      return longFrames;
    },
    longFrameLog,
    rotationLog,
    lastFrame: () => lastFrame,
    stress: (target) => {
      stressTarget = Math.max(0, target | 0);
    },
  };
  window.__floppy = debugApi;

  window.__floppyLaunch = {
    scriptInput: (slot, input, ticks) => {
      scripted[slot] = { input, ticks: Math.max(0, ticks | 0) };
    },
    startMatch: (opts = {}) => {
      const pool = matchLevelPool(settings.enabledLevels, extraLevels);
      const level = pool.find((l) => l.id === opts.level) ?? (opts.level === 'gym' ? gymLevel : null) ?? pool[0] ?? gymLevel;
      startSim(level, { playerCount: opts.humans ?? 1, bots: opts.bots ?? 3, seed: opts.seed ?? 1, firstTo: opts.firstTo });
      return level.id;
    },
    spawnWeapon: (id, x, y) => {
      if (!sim || !WEAPON_BY_ID.has(id)) return false;
      const p1 = sim.players()[0]?.get(Transform);
      spawnWeapon(sim.ecs, id, x ?? (p1?.x ?? 0) + 1, y ?? (p1?.y ?? 0) + 1);
      return true;
    },
    giveWeapon: (slot, id) => {
      if (!sim || !WEAPON_BY_ID.has(id)) return false;
      const owner = sim.players().find((e) => e.get(Player)?.slot === slot);
      const at = owner?.get(Transform);
      if (!owner || !at) return false;
      for (const w of sim.ecs.query(Weapon, Held)) {
        if (w.targetFor(HeldBy) === owner) sim.ctx.pendingDestroy.push(w);
      }
      const gun = spawnWeapon(sim.ecs, id, at.x, at.y, false);
      gun.add(Held(), HeldBy(owner));
      sim.ctx.bodies.get(gun)?.setActive(false);
      return true;
    },
    weaponIds: () => [...WEAPON_BY_ID.keys()],
    teleport: (slot, x, y) => {
      if (!sim) return false;
      const who = sim.players().find((e) => e.get(Player)?.slot === slot);
      const body = who ? sim.ctx.bodies.get(who) : undefined;
      if (!who || !body) return false;
      body.setPosition({ x, y });
      body.setLinearVelocity({ x: 0, y: 0 });
      who.set(Transform, { x, y, angle: 0 });
      return true;
    },
    projectiles: () => {
      const out: { kind: number; phase: number; fuse: number; x: number; y: number; defId: number }[] = [];
      if (!sim) return out;
      sim.ecs.query(Projectile).updateEach(([p]) => {
        out.push({ kind: p.kind, phase: p.phase, fuse: p.fuse, x: p.x, y: p.y, defId: p.defId });
      });
      return out;
    },
    stress: (target) => {
      stressTarget = Math.max(0, target | 0);
    },
  };

  function padMapFor(id: string) {
    return maps[id];
  }

  /** Which device steers a fighter slot right now (see {@link slotDevices}). */
  function deviceForSlot(slot: number, pads: (Gamepad | null)[]): string {
    // Seats decided: a pad that never joined steers nobody.
    if (slotDevices.length) return slotDevices[slot] ?? '';
    const pad = pads[slot];
    if (pad) return padKey(pad);
    return slot === 0 ? 'keyboard' : '';
  }

  function setPaused(on: boolean) {
    if (!sim || paused === on) return;
    paused = on;
    menus.screen = on ? 'pause' : 'play';
    show();
  }

  function quitToMenu() {
    if (online) {
      // Online the match belongs to the room: the host ends it for everyone, a client just steps out
      // of it and waits in the lobby for the next one.
      if (online.role === 'host') endOnlineMatch('the host ended it');
      else {
        room?.send('host', { t: 'input', input: packInput(EMPTY_INPUT) });
        endOnlineLocal('you left the match', 'left');
      }
      return;
    }
    trackMatchEnd('quit');
    sim?.destroy();
    sim = null;
    paused = false;
    slotDevices = [];
    resetBanner();
    menus.screen = 'menu';
    show();
  }

  // -----------------------------------------------------------------------------------------------
  // Online play. The host's browser runs the authoritative sim and every client mirrors it by
  // stepping the exact inputs the host stepped (src/net/online.ts). The relay — one Durable Object
  // per room code — only forwards messages; it knows nothing about the game.

  function pushChat(line: string) {
    menus.chat.push(line);
    if (menus.chat.length > 60) menus.chat.splice(0, menus.chat.length - 60);
  }

  /** Fighter slots for the room: the host first, then everyone else in join order. */
  function roomSlots(): MatchSlot[] {
    if (!room) return [];
    const hostId = room.hostId;
    const peers = [...room.peers.values()].sort((a, b) => (a.id === hostId ? -1 : b.id === hostId ? 1 : a.id - b.id));
    return peers.slice(0, MAX_PEERS).map((p, i) => ({ peer: p.id, name: p.name, color: i }));
  }

  function refreshLobbyPeers(peers?: { id: number; name: string; slot: number; color: number }[]) {
    const lobby = menus.lobby;
    if (!room) {
      lobby.peers = [];
      return;
    }
    const me = room.id;
    const hostId = room.hostId;
    const list = peers ?? roomSlots().map((s, i) => ({ id: s.peer!, name: s.name, slot: i, color: s.color }));
    lobby.peers = list.map((p) => ({ ...p, host: p.id === hostId, me: p.id === me }));
  }

  /** Host: tell the room what the lobby looks like (peers, rules, whether a match is running). */
  function broadcastLobby() {
    if (!room || room.role !== 'host') return;
    refreshLobbyPeers();
    const lobby = menus.lobby;
    lobby.bots = Math.min(menus.bots, Math.max(0, MAX_PEERS - room.peers.size));
    lobby.inMatch = !!sim && !!online;
    room.send('all', {
      t: 'lobby',
      peers: lobby.peers.map(({ id, name, slot, color }) => ({ id, name, slot, color })),
      maxHp: lobby.maxHp,
      firstTo: lobby.firstTo,
      bots: lobby.bots,
      inMatch: lobby.inMatch,
    });
    if (menus.screen === 'lobby') show();
  }

  async function joinOnline(role: 'host' | 'client') {
    if (room) return;
    const lobby = menus.lobby;
    lobby.name = lobby.name || `Player ${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem(NAME_KEY, lobby.name);
    let code = normalizeRoomCode(menus.roomCode);
    if (role === 'host' && !code) code = randomRoomCode();
    if (!isRoomCode(code)) {
      menus.notice = role === 'host' ? 'Room codes are 4–8 letters and digits.' : 'Enter the room code your host shared (4–8 letters and digits).';
      show();
      return;
    }
    menus.roomCode = code;
    lobby.phase = 'connecting';
    lobby.role = role;
    menus.notice = '';
    show();
    try {
      const session = await connectRoom({ code, role, name: lobby.name });
      if (lobby.phase !== 'connecting') {
        // Cancelled while the socket was opening.
        session.close();
        return;
      }
      room = session;
      wireRoom(session);
      lobby.phase = 'connected';
      lobby.shareUrl = shareUrl(code);
      lobby.maxHp = settings.maxHp;
      lobby.firstTo = settings.firstTo;
      lobby.ping = 0;
      menus.chat = [];
      history.replaceState(null, '', shareUrl(code));
      pushChat(role === 'host' ? `* you opened room ${code} — share the link or the code` : `* you joined room ${code}`);
      refreshLobbyPeers();
      if (role === 'host') broadcastLobby();
      pingTimer = window.setInterval(() => {
        if (!room) return;
        lobby.ping = room.rtt;
        const el = menusEl.querySelector('#ping');
        if (el) el.textContent = String(lobby.ping || '–');
      }, 2000);
    } catch (err) {
      lobby.phase = 'idle';
      menus.notice = err instanceof RoomError ? err.message : 'Could not connect to the room.';
      telemetry.error({ kind: 'room', message: err instanceof RoomError ? err.code : 'unknown', source: role, context: 'menu', renderer: rendererKind });
    }
    show();
  }

  function wireRoom(session: RoomSession) {
    session.on('peer', (peer) => {
      pushChat(`* ${peer.name} joined`);
      if (session.role === 'host') broadcastLobby();
      else refreshLobbyPeers();
      if (menus.screen === 'lobby') show();
    });
    session.on('left', (id) => {
      const slot = online?.slots.findIndex((s) => s.peer === id) ?? -1;
      const name = (slot >= 0 ? online?.names[slot] : undefined) ?? menus.lobby.peers.find((p) => p.id === id)?.name ?? 'someone';
      pushChat(`* ${name} left`);
      if (online?.role === 'host' && slot >= 0) online.remote.clear(slot);
      if (session.role === 'host') broadcastLobby();
      else refreshLobbyPeers();
      if (menus.screen === 'lobby') show();
    });
    session.on('closed', (reason) => {
      teardownRoom('disconnected');
      menus.notice = reason === 'host-left' ? 'The host left the room.' : 'Connection to the room was lost.';
      menus.screen = 'lobby';
      show();
    });
    session.on('message', onNetMessage);
  }

  /** `outcome` is how a match still running ends up in the statistics. */
  function teardownRoom(outcome: MatchOutcome = 'left') {
    window.clearInterval(pingTimer);
    room?.close();
    room = null;
    online = null;
    menus.online = false;
    trackMatchEnd(outcome);
    sim?.destroy();
    sim = null;
    paused = false;
    slotDevices = [];
    resetBanner();
    menus.lobby.phase = 'idle';
    menus.lobby.peers = [];
    menus.lobby.inMatch = false;
    menus.chat = [];
    history.replaceState(null, '', location.pathname);
  }

  function leaveRoom() {
    teardownRoom();
    menus.screen = 'lobby';
    show();
  }

  /** Host: deal a match to everyone in the room (also the rematch). */
  async function startOnlineMatch() {
    if (!room || room.role !== 'host' || matchStarting) return;
    if (sim && online && !matchIsOver() && menus.screen === 'lobby') {
      // "Back to match": the host only peeked at the lobby.
      menus.screen = 'play';
      show();
      return;
    }
    matchStarting = true;
    try {
      extraLevels = settings.includeUserLevels ? await loadLibrary().catch(() => []) : [];
      const slots = roomSlots();
      const bots = Math.min(menus.bots, MAX_PEERS - slots.length);
      for (let i = 0; i < bots; i++) slots.push({ peer: null, name: `Bot ${slots.length + 1}`, color: slots.length });
      const rules: MatchRules = {
        maxHp: menus.lobby.maxHp,
        firstTo: menus.lobby.firstTo,
        showWins: settings.showWins,
        rotation: settings.rotation,
        enabledWeapons: settings.enabledWeapons,
        enabledLevels: settings.enabledLevels,
      };
      const pool = matchLevelPool(rules.enabledLevels, extraLevels);
      const level = rules.rotation === 'ordered' ? (pool[0] ?? gymLevel) : (pool[Math.floor(Math.random() * pool.length)] ?? gymLevel);
      const seed = (Math.random() * 1e9) | 0;
      room.send('all', { t: 'start', seed, levelId: level.id, slots, rules, extraLevels });
      beginOnlineMatch('host', seed, level, slots, rules);
      broadcastLobby();
    } finally {
      matchStarting = false;
    }
  }

  /** Everyone: build this browser's mirror of the match. */
  function beginOnlineMatch(role: 'host' | 'client', seed: number, level: LevelDef, slots: MatchSlot[], rules: MatchRules) {
    if (!room) return;
    const me = room.id;
    online = createOnlineMatch(role, slots, me, (input) => room?.send('host', { t: 'input', input }));
    menus.online = true;
    menus.lobby.inMatch = true;
    const humans = slots.filter((s) => s.peer !== null).length;
    startSim(level, {
      playerCount: humans,
      bots: slots.length - humans,
      seed,
      maxHp: rules.maxHp,
      firstTo: rules.firstTo,
      devices: slots.map((s) => (s.peer === me ? 'auto' : '')),
      colors: slots.map((s) => s.color),
      rules,
    });
    if (sim) {
      online.outboxStart = sim.ctx.tick;
      online.nextTick = sim.ctx.tick;
    }
  }

  /** Host: stop the match for everyone; the room stays open. */
  function endOnlineMatch(reason: string) {
    if (room?.role === 'host') room.send('all', { t: 'end', reason });
    endOnlineLocal(reason, 'host-ended');
    if (room?.role === 'host') broadcastLobby();
  }

  /** Drop this browser's copy of the match and go back to the lobby. */
  function endOnlineLocal(reason: string, outcome: MatchOutcome) {
    trackMatchEnd(outcome);
    sim?.destroy();
    sim = null;
    online = null;
    menus.online = false;
    paused = false;
    hitStop = 0;
    slotDevices = [];
    resetBanner();
    if (reason) pushChat(`* match over — ${reason}`);
    menus.screen = 'lobby';
    show();
  }

  /** Client: my world disagrees with the host's; ask for its state (at most once every few seconds). */
  function requestResync(why: string) {
    if (!online || !room || !sim) return;
    const now = performance.now();
    online.desync = true;
    if (now - online.lastResyncAt < 3000) return;
    online.lastResyncAt = now;
    if (tracked) tracked.resyncs += 1;
    telemetry.error({ kind: 'desync', message: why, source: `tick ${sim.ctx.tick}`, context: 'online', renderer: rendererKind });
    console.warn(`[online] out of sync (${why}) at tick ${sim.ctx.tick}; asking the host for a snapshot`);
    room.send('host', { t: 'resync', tick: sim.ctx.tick });
  }

  function onNetMessage(msg: NetMessage, from: number) {
    if (!room) return;
    const isHost = room.role === 'host';
    switch (msg.t) {
      case 'lobby': {
        if (isHost) return;
        menus.lobby.maxHp = msg.maxHp;
        menus.lobby.firstTo = msg.firstTo;
        menus.lobby.bots = msg.bots;
        menus.lobby.inMatch = msg.inMatch;
        refreshLobbyPeers(msg.peers);
        if (menus.screen === 'lobby') show();
        return;
      }
      case 'start': {
        if (isHost || from !== room.hostId) return;
        // The host's custom arenas go through the schema like any other level JSON; a broken one is
        // dropped rather than let loose in the sim.
        extraLevels = [];
        for (const raw of Array.isArray(msg.extraLevels) ? msg.extraLevels : []) {
          try {
            extraLevels.push(parseLevel(raw));
          } catch {
            // skip
          }
        }
        const pool = matchLevelPool(msg.rules.enabledLevels, extraLevels);
        const level = pool.find((l) => l.id === msg.levelId);
        if (!level) {
          menus.notice = `The host started on a level this build does not have (${msg.levelId}).`;
          show();
          return;
        }
        beginOnlineMatch('client', msg.seed, level, msg.slots, msg.rules);
        return;
      }
      case 'frames': {
        if (isHost || !online || !sim || from !== room.hostId) return;
        if (!acceptFrames(online, msg.start, msg.frames, msg.hash)) requestResync('missed frames');
        return;
      }
      case 'input': {
        if (!isHost || !online) return;
        const slot = online.slots.findIndex((s) => s.peer === from);
        if (slot >= 0 && Array.isArray(msg.input)) online.remote.push(slot, msg.input);
        return;
      }
      case 'end':
        if (isHost || from !== room.hostId) return;
        menus.lobby.inMatch = false;
        if (online) endOnlineLocal(msg.reason, 'host-ended');
        else if (menus.screen === 'lobby') show();
        return;
      case 'chat': {
        pushChat(`${cleanPeerName(msg.from)}: ${String(msg.text).slice(0, 200)}`);
        if (isHost) {
          for (const id of room.peers.keys()) if (id !== from && id !== room.id) room.send(id, msg);
        }
        if (menus.screen === 'lobby') show();
        return;
      }
      case 'resync':
        if (!isHost || !sim || !online) return;
        room.send(from, { t: 'snapshot', snap: sim.snapshot() });
        return;
      case 'snapshot':
        if (isHost || !online || from !== room.hostId) return;
        online.pendingSnapshot = msg.snap;
        return;
      default:
        return;
    }
  }

  /** Screens whose controls are plain DOM the cursor can walk; the others have bespoke pad handling. */
  const NAV_SCREENS = new Set(['menu', 'settings', 'lobby', 'pause', 'disconnect', 'scoreboard']);

  function backOut() {
    if (menus.screen === 'pause') setPaused(false);
    else if (menus.screen === 'lobby') {
      // Leaving a room is deliberate (the Leave button); Back only closes the empty form.
      if (menus.lobby.phase !== 'idle') return;
      menus.screen = 'menu';
      show();
    } else if (menus.screen === 'join' || menus.screen === 'settings') {
      menus.screen = 'menu';
      show();
    }
  }

  /** Walk the focused menu with a direction / accept / back triple (shared by pads and arrow keys). */
  function navigateMenu(dir: NavDir | null, accept: boolean, back: boolean) {
    if (dir) {
      const cur = focusedIn(menusEl);
      if (!(cur && nudge(cur, dir))) moveFocus(menusEl, dir);
    }
    if (accept) {
      const cur = focusedIn(menusEl) ?? defaultFocus(menusEl);
      if (cur) {
        setFocus(menusEl, cur);
        activate(cur);
      }
    }
    if (back) backOut();
  }

  function dirOf(e: PadEdges): NavDir | null {
    return e.up ? 'up' : e.down ? 'down' : e.left ? 'left' : e.right ? 'right' : null;
  }

  /** One pad's menu presses this frame, applied to whatever screen is up. */
  function handlePadMenu(pad: Gamepad, e: PadEdges) {
    if (!(e.a || e.b || e.start || e.select || e.up || e.down || e.left || e.right)) return;
    applyPadMenu(pad, e);
    // Landing on a fresh screen: show the cursor straight away so the next press has a target.
    if (NAV_SCREENS.has(menus.screen) && !focusedIn(menusEl)) setFocus(menusEl, defaultFocus(menusEl));
  }

  function applyPadMenu(pad: Gamepad, e: PadEdges) {
    const device = padKey(pad);
    if (e.a || e.b || e.start || e.select) lastMenuDevice = device;
    const screen = menus.screen;
    if (screen === 'play') {
      if (!sim) return;
      if (matchIsOver()) {
        if (e.start) rematch();
        else if (e.select) quitToMenu();
      } else if (e.start) {
        setPaused(true);
      }
      return;
    }
    if (screen === 'editor') return;
    if (screen === 'join') {
      if (pad.mapping && pad.mapping !== 'standard' && !maps[pad.id]) {
        menus.notice = `Non-standard pad “${pad.id}” — open Settings to remap.`;
      }
      if (e.a) takeOrReadySeat(menus.seats, device, padLabel(pad));
      if (e.b) {
        backOut();
        return;
      }
      if (e.start) {
        startIfReady();
        return;
      }
      const seat = menus.seats.find((s) => s.taken && s.padId === device);
      if ((e.left || e.right) && seat) cycleSeatColor(seat, e.right ? 1 : -1, menus.seats);
      if (e.up || e.down) menus.bots = Math.max(0, Math.min(maxBots(menus.seats), menus.bots + (e.up ? 1 : -1)));
      show();
      return;
    }
    if (screen === 'pause' && (e.start || e.b)) {
      setPaused(false);
      return;
    }
    navigateMenu(dirOf(e), e.a || e.start, e.b);
  }

  function sampleInputs(): PlayerInput[] {
    const now = performance.now();
    const inputs = blankInputs(4);
    const pads = pollGamepads();
    const padInputs: (PlayerInput | undefined)[] = [];
    pads.forEach((pad, i) => {
      if (!pad) return;
      const latch = (latches[i] ??= emptyLatch());
      const aim = lastAim[i] ?? { x: 0, y: 0 };
      const map = padMapFor(pad.id);
      const input = readPad(pad, latch, aim, map);
      // Start is edge-detected below (menus, pause, rematch); the latch would otherwise re-fire.
      latch.pause = false;
      padInputs[i] = input;
      lastAim[i] = { x: input.aimX, y: input.aimY };
      const tracker = (padEdges[i] ??= createPadEdgeTracker());
      handlePadMenu(pad, tracker.update(pad, now, (map ?? DEFAULT_MAP).pause));
    });

    // Each fighter slot reads the device that took its seat; the keyboard aims with the mouse
    // relative to its own fighter.
    for (let slot = 0; slot < inputs.length; slot++) {
      const device = deviceForSlot(slot, pads);
      if (!device) continue;
      // Online, this browser's fighter takes the first pad that has shown itself, else the keyboard.
      const autoPad = device === 'auto' ? pads.find(Boolean) : undefined;
      if (device === 'keyboard' || (device === 'auto' && !autoPad)) {
        const p = sim?.players().find((e) => e.get(Player)?.slot === slot);
        const t = p?.get(Transform) ?? { x: 8, y: 6 };
        inputs[slot] = keys.sample({ x: t.x, y: t.y }, cam, view.w, view.h);
      } else {
        const input = padInputs[autoPad ? autoPad.index : padIndexOf(device)];
        if (input) inputs[slot] = input;
      }
    }

    const pauseTap = keys.takePause();
    if (pauseTap && sim && (menus.screen === 'play' || menus.screen === 'pause' || menus.screen === 'disconnect')) setPaused(menus.screen === 'play');
    return inputs;
  }

  function rumble(kind: 'hit' | 'boom') {
    if (!settings.haptics || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    for (const pad of navigator.getGamepads()) {
      const actuator = pad?.vibrationActuator;
      if (!actuator?.playEffect) continue;
      void actuator.playEffect('dual-rumble', {
        duration: kind === 'boom' ? 180 : 60,
        strongMagnitude: kind === 'boom' ? 0.8 : 0.35,
        weakMagnitude: 0.4,
      });
    }
  }

  let lastFrameError = '';
  function tick(now: number) {
    try {
      frame(now);
    } catch (err) {
      // One bad frame must not take the whole game down: keep the loop alive and shout once per fault.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== lastFrameError) {
        lastFrameError = msg;
        console.error('frame error', err);
        telemetry.error({
          kind: 'frame',
          message: msg,
          source: err instanceof Error ? (err.stack?.split('\n')[1]?.trim() ?? '') : '',
          context: tracked ? tracked.mode : 'menu',
          renderer: rendererKind,
        });
      }
    }
    raf = requestAnimationFrame(tick);
  }

  /** One sim tick with the given inputs plus everything the presentation hangs off its events. */
  function simTick(sampled: PlayerInput[]) {
    if (!sim) return;
    recorder.push(sampled);
    const events = sim.step(sampled);
    if (sim.ctx.level !== renderedLevel) {
      // The sim rotated to the next arena: last round's blood and embers must not carry over.
      renderedLevel = sim.ctx.level;
      rotatedThisFrame = true;
      particles.clear();
      decals.length = 0;
      decalPool.release(decalLayer);
      decalLayer = decalPool.acquire(renderedLevel.bounds);
    }
    mixer.handle(events);
    emitFromEvents(events, particles, decals);
    if (stressTarget > 0) {
      if (sim.ctx.tick % 30 === 0) armFighters(sim, stressRng);
      if (particles.count < stressTarget) emitFromEvents(stressEvents(sim, stressRng), particles, decals);
    }
    const world = sim.ecs;
    decalLayer.stampNew(decals, (d) => (!settings.reduceBlood || d.kind === 'scorch') && snapDecalToSurface(world, d));
    // Once stamped into the texture the decal records are dead weight; keeping them for the whole
    // round only grew the old generation (a long stress round piles up tens of thousands).
    decals.length = 0;
    decalLayer.consumed = 0;
    if (events.some((e) => e.type === 'kill')) {
      hitStop = 3;
      const kills = events.filter((e) => e.type === 'kill').length;
      recordKos(kills);
      if (tracked) tracked.kills += kills;
    } else if (events.some((e) => e.type === 'hit' && e.damage >= 15) || events.some((e) => e.type === 'clash')) {
      // A frame of freeze on a solid hit sells the impact (punches, headshots, clashes), like the kill stop.
      hitStop = 1;
    }
    if (events.some((e) => e.type === 'round-phase' && e.phase === 'match-over')) {
      const ms = sim.ecs.get(MatchState);
      // Online, "my" fighter is whichever slot this browser steers; at the couch it is always P1.
      const mySlot = online ? online.localSlot : 0;
      const wins = [ms?.wins0 ?? 0, ms?.wins1 ?? 0, ms?.wins2 ?? 0, ms?.wins3 ?? 0];
      const won = (wins[mySlot] ?? 0) >= (ms?.firstTo || 1);
      stats = recordMatch(won);
      trackMatchEnd('finished', won);
    }
    if (!settings.reduceShake) {
      if (events.some((e) => e.type === 'explosion' || e.type === 'kill')) addShake(cam, events.some((e) => e.type === 'explosion') ? 16 : 9);
      else if (events.some((e) => e.type === 'hit' && e.damage >= 15)) addShake(cam, 4);
      else if (events.some((e) => e.type === 'clash')) addShake(cam, 3);
    }
    if (events.some((e) => e.type === 'explosion')) rumble('boom');
    else if (events.some((e) => e.type === 'hit')) rumble('hit');
    latches.forEach(consumeLatch);
    keys.consume();
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    let t = profiler.begin();
    profiler.sample('interval', now - last);
    // A 120 Hz frame is 8.3 ms; anything past 12 ms between rAF callbacks means a missed one. The
    // frame before it is what ran long, so that is the one logged.
    const heapNow = usedHeapMb();
    if (tracked && sim && menus.screen === 'play') {
      // Frame pacing while a match is actually being played: not the pause card, not the menus.
      perfAgg.frame(now - last);
      if (now - tracked.lastPerfAt >= PERF_EVERY_MS) flushPerf('periodic');
    }
    if (sim && menus.screen === 'play' && now - last > 12) {
      longFrames += 1;
      if (longFrameLog.length < 64) {
        // A heap that shrank across the gap points at a major GC rather than at our own frame work.
        longFrameLog.push({ at: Math.round(now), interval: +(now - last).toFixed(1), tick: sim.ctx.tick, before: profiler.last(), heapBefore: lastHeap, heapAfter: heapNow });
      }
    }
    lastHeap = heapNow;
    last = now;
    // Without a ResizeObserver the size has to be read each frame (a layout read). A DPR change
    // (window dragged to another display) keeps the CSS size, so it is checked here.
    if (!sizeObserver) measureCanvas();
    if (window.devicePixelRatio !== lastDpr) {
      lastDpr = window.devicePixelRatio;
      viewDirty = true;
    }
    if (renderer && viewDirty) {
      renderer.resize(view.w, view.h);
      viewDirty = false;
    }
    // Pads and keys are read every frame: they drive the join screen and pause toggling, not just the fight.
    const live = sampleInputs();
    t = profiler.lap('input', t);
    // The match stays on screen (still) behind the pause and disconnect cards.
    const showMatch = !!sim && (menus.screen === 'play' || menus.screen === 'pause' || menus.screen === 'disconnect');
    if (hudShown !== showMatch) {
      hudShown = showMatch;
      hudEl.classList.toggle('hidden', !showMatch);
    }
    if (sim && showMatch) {
      // An online match never pauses for one player: the pause card is only a menu over the fight.
      const running = online ? true : menus.screen === 'play' && !paused;
      const slowmo = sim.ecs.get(RoundState)?.phase === RoundPhase.LastKill ? tuning.lastKillSlowmo : 1;
      const isClient = online?.role === 'client';
      // A client's clock leans toward keeping a few frames in hand (src/net/online.ts).
      const scale = isClient && online ? slowmo * pacingScale(online.inbox.length) : slowmo;
      let steps = running ? loop.consume(dt, scale) : 0;
      if (frozen) {
        steps = frozenSteps;
        frozenSteps = 0;
      }
      if (!running) {
        // Paused: drop the presses so a jump latched behind the menu does not fire on resume.
        latches.forEach(consumeLatch);
        keys.consume();
      }
      if (isClient && online) {
        // My input goes to the host; the sim only advances through frames the host has stepped.
        if (online.localSlot >= 0 && menus.screen === 'play') online.sender?.update(live[online.localSlot] ?? EMPTY_INPUT, now);
        steps = clientSteps(steps, online.inbox.length);
        if (online.inbox.length === 0) online.stalledSince ||= now;
        else online.stalledSince = 0;
      }
      let hostHash: { tick: number; h: string } | undefined;
      for (let i = 0; i < steps; i++) {
        if (hitStop > 0) {
          hitStop -= 1;
          continue;
        }
        let sampled: PlayerInput[];
        let packed: PackedInput[] | null = null;
        if (isClient && online) {
          const next = online.inbox.shift();
          if (!next) break;
          const snap = online.pendingSnapshot;
          if (snap) {
            // The host's state at tick T applies just before we step T; anything older is stale.
            if (snap.tick === sim.ctx.tick) {
              restoreWorld(sim.ecs, snap);
              online.desync = false;
              online.pendingSnapshot = null;
            } else if (snap.tick < sim.ctx.tick) online.pendingSnapshot = null;
          }
          sampled = next;
        } else if (online) {
          // Host: remote fighters step with what they sent, local ones with what the wire can carry,
          // so the frame broadcast below reproduces this tick bit for bit on every client.
          const live2 = applyScriptedInputs(live);
          const me = room?.id;
          packed = live2.map((input, s) => {
            const slot = online!.slots[s];
            return slot && slot.peer !== null && slot.peer !== me ? online!.remote.take(s) : packInput(input);
          });
          sampled = packed.map(unpackInput);
        } else {
          sampled = applyScriptedInputs(live);
        }
        simTick(sampled);
        if (online?.role === 'host' && packed) {
          online.outbox.push(packed);
          if (sim.ctx.tick % HASH_EVERY_TICKS === 0) hostHash = { tick: sim.ctx.tick, h: sim.hash() };
        } else if (isClient && online) {
          const ok = checkHash(online, sim.ctx.tick, () => sim!.hash());
          if (ok === false) requestResync('world hash differs');
        }
      }
      if (online?.role === 'host' && online.outbox.length && room) {
        room.send('all', { t: 'frames', start: online.outboxStart, frames: online.outbox, hash: hostHash });
        online.outboxStart = sim.ctx.tick;
        online.outbox = [];
      }
      profiler.sample('steps', steps);
      t = profiler.lap('sim', t);
      stepParticles(particles, dt);
      profiler.sample('particles', particles.count);
      t = profiler.lap('fx', t);
      const frame = buildFrame(
        sim,
        cam,
        interpolationAlpha(loop),
        view.w,
        view.h,
        settings.reduceBlood ? null : particles,
        {
          debug: debugDraw,
          freezeCamera: freezeCam,
          colorblind: settings.colorblind,
          decalLayer,
          flash: hitStop,
          // Limbs swing in the sim's time: slowed with the last-kill replay, held while paused.
          dt: running ? dt * slowmo : 0,
        },
      );
      // Hashing walks every networked entity; it is only ever read from the F3 overlay (which hashes
      // when it refreshes) and lazily through window.__floppy.lastHash, so ordinary frames skip it.
      frame.hud.gpuMs = renderer?.lastGpuMs ?? 0;
      profiler.sample('groups', frame.groups.length);
      lastFrame = frame;
      t = profiler.lap('build', t);
      renderer?.render(frame);
      if (renderer && renderer.gpuPassMs >= 0) profiler.sample('gpu', renderer.gpuPassMs);
      t = profiler.lap('render', t);
      drawHud(frame);
      profiler.lap('hud', t);
      profiler.end();
      // Stage means for the perf summary; every 8th frame is plenty and keeps the per-frame cost nil.
      if (tracked && running && (perfAgg.frames & 7) === 0) perfAgg.stages(profiler.last());
      if (rotatedThisFrame) {
        rotatedThisFrame = false;
        if (rotationLog.length < 64) rotationLog.push({ tick: sim.ctx.tick, level: renderedLevel.id, stages: profiler.last() });
      }
    } else if (renderer && !sim && DEMO_SCREENS.has(menus.screen)) {
      stepDemo(dt);
    } else if (renderer && menus.screen !== 'editor') {
      renderer.render({
        groups: [],
        camera: { x: 16, y: 9, zoom: 28, ppm: 28, shakeX: 0, shakeY: 0 },
        theme: { top: '#1b2030', bottom: '#111318', solid: '#333' },
        hud: { slowmo: false, countdown: 0 },
      });
    }
  }

  // The HUD is a handful of persistent DOM nodes; we only touch them when the
  // underlying value changes so CSS transitions/animations actually play.
  const hud = (() => {
    const mk = (cls: string, parent: HTMLElement = hudEl) => {
      const el = document.createElement('div');
      el.className = cls;
      parent.append(el);
      return el;
    };
    const bars = mk('hud-bars');
    // The score strip: title / fighter cards / verdict. Between rounds the strip itself grows into
    // the scorecard (CSS keyed on data-card), so the tally you watched all round is the scoreboard.
    const top = mk('hud-top');
    const title = mk('hud-title', top);
    const players = mk('hud-players', top);
    const sub = mk('hud-sub', top);
    const count = mk('hud-count');
    const level = mk('hud-level');
    const net = mk('hud-net');
    const dbg = document.createElement('pre');
    dbg.className = 'hidden';
    dbg.style.cssText =
      'position:absolute;right:12px;top:10px;margin:0;padding:8px;background:rgba(0,0,0,0.55);font:12px/1.4 monospace';
    hudEl.append(dbg);
    return {
      bars,
      top,
      title,
      players,
      sub,
      count,
      level,
      net,
      netText: '',
      dbg,
      lastCount: -1,
      /** Which fighters (slot/colour) the cards were built for; cards persist so their CSS transitions play. */
      lastRoster: '',
      cards: new Map<
        number,
        {
          card: HTMLElement;
          face: HTMLElement;
          tally: HTMLElement;
          wins: HTMLElement;
          hp: HTMLElement;
          crown: HTMLElement | null;
          /** Last values written to the DOM, so unchanged frames write nothing. */
          alive: string;
          winner: string;
          hpPct: number;
        }
      >(),
      lastCardKey: '',
      lastWins: [0, 0, 0, 0],
      goUntil: 0,
      levelUntil: 0,
      lastLevel: '',
      slowmo: false,
      levelShown: false,
      dbgShown: false,
      /** When the F3 readout text was last rebuilt (it refreshes at 10 Hz, not per frame). */
      dbgAt: 0,
    };
  })();

  /** A finished match's scorecard must not linger or flash into the next match. */
  function resetBanner() {
    hud.top.dataset.card = '0';
    delete hud.top.dataset.roundOver;
    hud.title.innerHTML = '';
    hud.sub.textContent = '';
    hud.lastCardKey = '';
    hud.lastRoster = '';
    hud.lastWins = [0, 0, 0, 0];
    hud.players.innerHTML = '';
    hud.cards.clear();
  }

  function drawHud(frame: ReturnType<typeof buildFrame>) {
    const h = frame.hud;
    const now = performance.now();

    if (hud.slowmo !== h.slowmo) {
      hud.slowmo = h.slowmo;
      hud.bars.classList.toggle('on', h.slowmo);
    }

    // Countdown numbers + GO!
    if (h.countdown !== hud.lastCount) {
      hud.count.innerHTML = '';
      if (h.countdown > 0) {
        const s = document.createElement('span');
        s.textContent = String(h.countdown);
        hud.count.append(s);
        hud.count.dataset.countdown = String(h.countdown);
      } else {
        delete hud.count.dataset.countdown;
        if (hud.lastCount > 0) {
          const s = document.createElement('span');
          s.className = 'go';
          s.textContent = 'FIGHT';
          hud.count.append(s);
          hud.goUntil = now + 700;
        }
      }
      hud.lastCount = h.countdown;
    } else if (hud.goUntil && now > hud.goUntil) {
      hud.count.innerHTML = '';
      hud.goUntil = 0;
    }

    // Level name: fades in during the countdown, out once the fight starts.
    if (h.levelName && h.levelName !== hud.lastLevel) {
      hud.level.textContent = h.levelName;
      hud.lastLevel = h.levelName;
    }
    const showLevel = h.countdown > 0 || h.phase === RoundPhase.Scoreboard;
    if (hud.levelShown !== showLevel) {
      hud.levelShown = showLevel;
      hud.level.classList.toggle('show', showLevel);
    }

    // Fighter cards. Built once per roster and then updated in place, so the strip's morph into the
    // scorecard (and back) is one continuous CSS transition rather than a rebuild.
    const plist = h.players ?? [];
    const wins = h.wins ?? [0, 0, 0, 0];
    const firstTo = h.firstTo ?? 0;
    const over = h.phase === RoundPhase.LastKill || h.phase === RoundPhase.Scoreboard || h.phase === RoundPhase.MatchOver;
    const winnerSlot = !over ? -1 : h.phase === RoundPhase.MatchOver ? (h.matchWinner ?? -1) : (h.roundWinner ?? -1);
    const roster = plist.map((p) => `${p.slot}:${p.color}`).join('|') + (h.showWins ? 'w' : '');
    if (roster !== hud.lastRoster) {
      hud.lastRoster = roster;
      hud.players.innerHTML = '';
      hud.cards.clear();
      for (const p of plist) {
        const card = document.createElement('div');
        card.className = 'hud-p';
        card.style.setProperty('--c', p.color);
        card.dataset.slot = String(p.slot);
        const face = document.createElement('div');
        face.className = 'hud-face';
        card.append(face);
        const tally = document.createElement('div');
        tally.className = 'hud-tally';
        const winsEl = document.createElement('div');
        winsEl.className = 'hud-wins';
        if (h.showWins) card.append(tally, winsEl);
        const hp = document.createElement('div');
        hp.className = 'hud-hp';
        hp.append(document.createElement('i'));
        card.append(hp);
        const name = document.createElement('div');
        name.className = 'hud-name';
        name.textContent = slotName(p.slot).toUpperCase();
        card.append(name);
        hud.players.append(card);
        hud.cards.set(p.slot, { card, face, tally, wins: winsEl, hp: hp.firstElementChild as HTMLElement, crown: null, alive: '', winner: '', hpPct: -1 });
      }
    }
    // Every write below is guarded by the value it last wrote: the DOM is only touched when a value
    // changes, so a steady frame costs no style or layout work at all.
    for (const p of plist) {
      const c = hud.cards.get(p.slot);
      if (!c) continue;
      const alive = p.alive ? '1' : '0';
      if (c.alive !== alive) c.card.dataset.alive = c.alive = alive;
      const winner = p.slot === winnerSlot ? '1' : '0';
      if (c.winner !== winner) c.card.dataset.winner = c.winner = winner;
      if (p.crown && !c.crown) {
        c.crown = document.createElement('i');
        c.crown.className = 'hud-crown';
        c.face.append(c.crown);
      } else if (!p.crown && c.crown) {
        c.crown.remove();
        c.crown = null;
      }
      // Quantised to whole percent so a slowly ticking burn does not restyle every frame.
      const hpPct = Math.round(Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp))) * 100);
      if (c.hpPct !== hpPct) {
        c.hpPct = hpPct;
        c.hp.style.setProperty('--hp', HP_SCALE[hpPct]!);
      }
      if (h.showWins) {
        const w = wins[p.slot] ?? 0;
        const n = Math.min(Math.max(firstTo, w, 1), 10);
        const gained = (hud.lastWins[p.slot] ?? 0) < w;
        if (c.tally.childElementCount !== n || c.wins.textContent !== String(w) || gained) {
          while (c.tally.childElementCount < n) c.tally.append(document.createElement('i'));
          while (c.tally.childElementCount > n) c.tally.lastElementChild?.remove();
          Array.from(c.tally.children).forEach((dot, i) => {
            dot.classList.toggle('on', i < w);
            // The freshly earned pip pops; the class stays until the next change so the animation completes.
            if (gained) dot.classList.toggle('pop', i === w - 1);
          });
          c.wins.textContent = String(w);
        }
      }
    }
    for (let i = 0; i < 4; i++) hud.lastWins[i] = wins[i] ?? 0;

    // Between rounds the strip becomes the scorecard: title above, verdict below, winner ringed.
    const cardMode = over ? '1' : '0';
    if (hud.top.dataset.card !== cardMode) {
      hud.top.dataset.card = cardMode;
      if (over) hud.top.dataset.roundOver = '1';
      else delete hud.top.dataset.roundOver;
    }
    const cardKey = over ? `${h.phase}:${winnerSlot}:${h.matchWinner ?? -1}` : '';
    if (cardKey !== hud.lastCardKey) {
      hud.lastCardKey = cardKey;
      // Leaving card mode keeps the old text in place: it collapses out of view, no blank box.
      if (over) {
        hud.title.innerHTML = '';
        const winner = plist.find((p) => p.slot === winnerSlot);
        hud.top.style.setProperty('--c', winner?.color ?? '#f4f1ea');
        const small = document.createElement('small');
        small.textContent =
          h.phase === RoundPhase.MatchOver ? 'Match over' : h.phase === RoundPhase.LastKill ? 'Last one standing' : 'Round over';
        const big = document.createElement('b');
        big.textContent = winner
          ? h.phase === RoundPhase.MatchOver
            ? `${slotName(winnerSlot)} wins the match`
            : `${slotName(winnerSlot)} takes it`
          : h.phase === RoundPhase.MatchOver
            ? 'Match over'
            : 'Everybody dies';
        hud.title.append(small, big);
        hud.sub.textContent =
          h.phase === RoundPhase.MatchOver
            ? online?.role === 'client'
              ? 'Waiting for the host to start the next match…'
              : isPadKey(slotDevices[0] ?? '')
                ? `Start — rematch · Select — ${online ? 'lobby' : 'menu'}`
                : `Start / Enter — rematch · Esc — ${online ? 'lobby' : 'menu'}`
            : firstTo
              ? `First to ${firstTo}`
              : 'Next level incoming';
      }
    }

    // Online status: only shows when something is off (a stall or a desync), so it is normally empty.
    const netText = !online
      ? ''
      : online.desync
        ? 'Out of sync with the host — resyncing…'
        : online.role === 'client' && online.stalledSince && performance.now() - online.stalledSince > 1000
          ? 'Waiting for the host…'
          : '';
    if (hud.netText !== netText) {
      hud.netText = netText;
      hud.net.textContent = netText;
      hud.net.classList.toggle('show', netText !== '');
    }

    // Debug readout (F3).
    if (hud.dbgShown !== debugHud) {
      hud.dbgShown = debugHud;
      hud.dbg.classList.toggle('hidden', !debugHud);
    }
    // Percentiles over 12 rings and the world hash cost ~0.4 ms; refreshing the readout at 10 Hz keeps
    // the overlay itself from showing up in the numbers it displays.
    if (debugHud && now - hud.dbgAt >= 100) {
      hud.dbgAt = now;
      const players = sim
        ? sim.players().map((e, i) => {
            const slot = e.get(Player)?.slot ?? i;
            const hpNow = e.get(Health)?.hp ?? 0;
            const dead = e.has(Dead) ? ' dead' : '';
            return `P${slot + 1} hp ${hpNow.toFixed(0)}${dead}`;
          })
        : [];
      const perf = profiler.stats();
      const ms = (k: string) => perf[k] ?? { med: 0, p95: 0, p99: 0, max: 0, mean: 0 };
      hud.dbg.textContent = [
        `tick ${h.tick ?? 0}`,
        `hash ${sim?.hash() ?? h.hash ?? '--------'}`,
        `phys ${(h.physicsMs ?? 0).toFixed(2)} ms`,
        `enc  ${(h.gpuMs ?? 0).toFixed(2)} ms`,
        `gpu  ${perf.gpu ? `${perf.gpu.med.toFixed(2)} / p99 ${perf.gpu.p99.toFixed(2)} ms` : 'n/a'}`,
        `ents ${h.entities ?? 0}`,
        `rend ${rendererKind} ${renderer?.canvas.width ?? 0}x${renderer?.canvas.height ?? 0} @${(renderer?.resolutionScale ?? 1).toFixed(2)}`,
        `phase ${h.phase ?? 0}`,
        `frame ${ms('frame').med.toFixed(2)} / p99 ${ms('frame').p99.toFixed(2)} ms  (rAF ${ms('interval').med.toFixed(1)} ms)`,
        `parts ${ms('particles').max | 0}  groups ${ms('groups').max | 0}${stressTarget ? `  stress ${stressTarget}` : ''}`,
        formatStats({ input: ms('input'), sim: ms('sim'), fx: ms('fx'), build: ms('build') }),
        formatStats({ render: ms('render'), hud: ms('hud'), debug: ms('debug') }),
        ...players,
      ].join('\n');
    }
  }

  function bindDebug() {
    type PaneUi = { addBinding: (o: object, k: string) => void; hidden: boolean };
    pane = new Pane({ title: 'Tuning' });
    const ui = pane as unknown as PaneUi;
    ui.addBinding(tuning, 'runSpeed');
    ui.addBinding(tuning, 'jumpSpeed');
    ui.addBinding(tuning, 'gravity');
    ui.hidden = true;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') debugDraw = !debugDraw;
      if (e.code === 'F2') ui.hidden = !ui.hidden;
      if (e.code === 'F3') debugHud = !debugHud;
      if (e.code === 'F4' && sim) {
        const p = sim.players()[0]?.get(Transform);
        if (p) spawnWeapon(sim.ecs, 'pistol', p.x + 0.4, p.y + 0.6);
      }
      if (e.code === 'F5' && sim) {
        const p = sim.players()[0];
        if (p && !p.has(Dead)) p.set(Health, { hp: 0, maxHp: p.get(Health)?.maxHp ?? 100 });
      }
      if (e.code === 'F6') {
        freezeCam = false;
        tuning.lastKillSlowmo = tuning.lastKillSlowmo < 1 ? 1 : 0.3;
      }
      if (e.code === 'F7') freezeCam = !freezeCam;
      if (e.code === 'F8') void switchRenderer();
      if (e.code === 'F9') recorder.download();
    });
  }

  let gpuAttemptPending = false;
  function adoptGpu(gpuCanvas: HTMLCanvasElement, gpu: Renderer) {
    adoptCanvas(gpuCanvas);
    renderer = gpu;
    rendererKind = 'gpu';
    // The normal case needs no label; the notice is for things worth knowing (fallbacks, odd pads).
    if (menus.notice.startsWith('Canvas fallback')) menus.notice = '';
    if (menus.screen !== 'play') show();
  }

  async function tryAdoptGpu(): Promise<boolean> {
    // One attempt at a time: a hung adapter request must not be joined by a pile of clones.
    if (gpuAttemptPending) return false;
    gpuAttemptPending = true;
    const gpuCanvas = document.createElement('canvas');
    const gpu = await tryCreateGpuRenderer(gpuCanvas, { lighting: settings.lighting }, 12_000, (late) => {
      gpuAttemptPending = false;
      if (rendererKind === 'canvas' && settings.renderer !== 'canvas') adoptGpu(gpuCanvas, late);
    });
    if (gpu) {
      gpuAttemptPending = false;
      adoptGpu(gpuCanvas, gpu);
      return true;
    }
    const why = gpuFailureReason();
    menus.notice = why ? `Canvas fallback — WebGPU ${why}` : 'Canvas fallback';
    telemetry.error({ kind: 'gpu-fallback', message: why ?? 'unavailable', source: settings.renderer, context: tracked ? tracked.mode : 'menu', renderer: 'canvas' });
    if (menus.screen !== 'play') show();
    // A timed-out attempt is still in flight and will adopt itself if it ever lands; a hard failure is final.
    if (why !== 'timed out') gpuAttemptPending = false;
    return false;
  }

  async function switchRenderer() {
    if (rendererKind === 'gpu') {
      const c = document.createElement('canvas');
      renderer = createCanvasRenderer(c);
      adoptCanvas(c);
      rendererKind = 'canvas';
      menus.notice = 'Canvas fallback';
    } else if (settings.renderer !== 'canvas') {
      await tryAdoptGpu();
    }
    if (menus.screen !== 'play') show();
  }

  return {
    async start() {
      // An invite link (?room=CODE) opens the lobby with the code filled in; joining still takes a
      // click so the browser has the user gesture audio needs.
      const linkedRoom = normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? '');
      if (isRoomCode(linkedRoom) && menus.screen === 'menu') {
        menus.roomCode = linkedRoom;
        menus.screen = 'lobby';
      }
      show();
      telemetry.page({
        renderer: settings.renderer,
        entry: isRoomCode(linkedRoom) ? 'invite' : 'direct',
        standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: Math.round(window.devicePixelRatio * 100) / 100,
        cores: navigator.hardwareConcurrency ?? 0,
        memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
        touch: (navigator.maxTouchPoints ?? 0) > 0,
        gamepads: pollGamepads().filter(Boolean).length,
      });
      // Closing the tab mid-match still yields an end row (with how long it ran) before the last batch goes out.
      telemetry.onPageHide(() => trackMatchEnd('unload'));
      window.addEventListener('gamepadconnected', (ev) => {
        const pad = (ev as GamepadEvent).gamepad ?? pollGamepads().find(Boolean);
        if (!pad) return;
        if (pad.mapping && pad.mapping !== 'standard' && !maps[pad.id]) {
          menus.notice = `Non-standard pad “${pad.id}” — open Settings to remap.`;
        }
        const key = padKey(pad);
        if (menus.screen === 'disconnect') {
          // The browser usually hands a returning pad its old index; if not, the fighter whose pad
          // vanished takes the newcomer.
          const connected = new Set(pollGamepads().filter(Boolean).map((p) => padKey(p!)));
          const orphan = slotDevices.findIndex((d) => isPadKey(d) && !connected.has(d));
          if (!slotDevices.includes(key) && orphan >= 0) {
            const old = slotDevices[orphan]!;
            slotDevices[orphan] = key;
            const seat = menus.seats.find((s) => s.padId === old);
            if (seat) seat.padId = key;
          }
          if (slotDevices.includes(key) || slotDevices.every((d) => !isPadKey(d) || connected.has(d))) setPaused(false);
          return;
        }
        if (menus.screen === 'join') {
          takeSeat(menus.seats, key, padLabel(pad));
          show();
        }
      });
      window.addEventListener('gamepaddisconnected', (ev) => {
        const pad = (ev as GamepadEvent).gamepad;
        if (pad) padEdges[pad.index]?.reset();
        // Only a pad that is actually steering a fighter interrupts the match.
        const inMatch = !pad || slotDevices.includes(padKey(pad)) || (!slotDevices.length && pad.index < humanCount);
        if (sim && inMatch && (menus.screen === 'play' || menus.screen === 'pause')) {
          paused = true;
          menus.screen = 'disconnect';
          show();
        }
      });
      const isTextField = (el: Element | null) =>
        el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'range', 'number', 'button'].includes(el.type));
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' && matchIsOver()) {
          rematch();
          return;
        }
        if (menus.screen === 'join') {
          lastMenuDevice = 'keyboard';
          if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            const seat = menus.seats.find((s) => s.taken && s.padId === 'keyboard') ?? [...menus.seats].reverse().find((s) => s.taken);
            if (seat?.taken) {
              cycleSeatColor(seat, e.code === 'ArrowRight' ? 1 : -1, menus.seats);
              show();
            }
            return;
          }
          if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
            menus.bots = Math.max(0, Math.min(maxBots(menus.seats), menus.bots + (e.code === 'ArrowUp' ? 1 : -1)));
            show();
            return;
          }
          if (e.code === 'Space' || e.code === 'KeyA') {
            takeOrReadySeat(menus.seats, 'keyboard', 'Keyboard');
            show();
            return;
          }
          if (e.code === 'Enter') {
            startIfReady();
            return;
          }
          if (e.code === 'Escape') {
            backOut();
            return;
          }
          return;
        }
        if (NAV_SCREENS.has(menus.screen)) {
          lastMenuDevice = 'keyboard';
          const active = document.activeElement;
          // Arrow keys walk the menu unless a field that uses them natively (text, select) has focus.
          const dir: NavDir | null =
            e.code === 'ArrowUp' ? 'up' : e.code === 'ArrowDown' ? 'down' : e.code === 'ArrowLeft' ? 'left' : e.code === 'ArrowRight' ? 'right' : null;
          if (dir && !isTextField(active) && !(active instanceof HTMLSelectElement)) {
            e.preventDefault();
            navigateMenu(dir, false, false);
            return;
          }
          // Enter with nothing focused takes the screen's primary action (a focused button already clicks itself).
          if (e.code === 'Enter' && !focusedIn(menusEl)) navigateMenu(null, true, false);
          if (e.code === 'Escape' && menus.screen !== 'menu') backOut();
        }
      });
      // Mouse users steer the cursor themselves: drop the pad ring the moment they take over.
      menusEl.addEventListener('pointerdown', () => {
        lastMenuDevice = 'keyboard';
        for (const el of menusEl.querySelectorAll('.pad-focus')) el.classList.remove('pad-focus');
      });
      renderer = createCanvasRenderer(canvas);
      bindDebug();
      // Opening the audio device costs ~200 ms on the main thread; do it behind the title screen
      // (once the first frames are up) rather than on the first frame of the match.
      window.setTimeout(() => mixer.warm(), 1000);
      if ('serviceWorker' in navigator) {
        if (import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js');
        else void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
      }
      raf = requestAnimationFrame(tick);
      if (settings.renderer !== 'canvas') {
        void tryAdoptGpu()
          .then((ok) => {
            if (ok && menus.screen !== 'play') show();
          })
          .catch(() => undefined);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      trackMatchEnd('unload');
      teardownRoom();
      stopDemo();
      telemetry.destroy();
    },
  };
}
