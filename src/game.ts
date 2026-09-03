import { Pane } from 'tweakpane';
import { attachBots } from './sim/ai/bots';
import { createFixedStepLoop, interpolationAlpha } from './core/loop';
import { createMixer } from './audio/mixer';
import { createKeyboardFallback } from './input/keyboard';
import { consumeLatch, emptyLatch, pollGamepads, readPad, type Latch } from './input/gamepad';
import { collectPadMap, createMenuState, cycleSeatColor, renderMenus } from './ui/menus';
import { loadMaps, saveMap } from './input/remap';
import { gymLevel } from './levels/catalog';
import { matchLevelPool } from './levels/catalog';
import { addShake, createCamera } from './render/camera';
import { buildFrame } from './render/buildFrame';
import { createCanvasRenderer, type Renderer } from './render/canvas/renderer';
import { tryCreateGpuRenderer } from './render/gpu/renderer';
import { emitFromEvents, stepParticles, type Decal, type Particle } from './render/fx/particles';
import { blankInputs, type PlayerInput } from './sim/input';
import { Dead, Health, MatchState, Player, RoundPhase, RoundState, Transform } from './sim/traits';
import { createSimWorld, type SimHandle } from './sim/world';
import { spawnWeapon } from './sim/systems/weapons';
import { tuning } from './sim/tuning';
import { loadSettings, saveSettings, type UserSettings } from './ui/settingsStore';
import { createEditorState, fromHash, loadLibrary, type EditorState } from './editor/editor';
import { mountEditor } from './editor/view';
import { createLocalLoopback } from './net/transport';
import { createRecorder } from './input/replay';
import type { LevelDef } from './sim/level/schema';

export type Game = {
  start: () => Promise<void>;
  stop: () => void;
};

type FloppyDebug = {
  rendererKind: 'gpu' | 'canvas';
  lastHash: string;
  tick: number;
  countdown: number;
  physicsMs: number;
  gpuMs: number;
};

declare global {
  interface Window {
    __floppy?: FloppyDebug;
  }
}

export function createGame(root: HTMLElement): Game {
  const canvas = root.querySelector('#game') as HTMLCanvasElement;
  const menusEl = root.querySelector('#menus') as HTMLElement;
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
  const lastAim = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ];
  let renderer: Renderer | null = null;
  let rendererKind: 'gpu' | 'canvas' = 'canvas';
  let sim: SimHandle | null = null;
  let cam = createCamera(gymLevel.bounds);
  let particles: Particle[] = [];
  const decals: Decal[] = [];
  let raf = 0;
  let last = performance.now();
  let paused = false;
  let editor: EditorState | null = null;
  let pane: Pane | null = null;
  const net = createLocalLoopback();
  let extraLevels: LevelDef[] = [];
  let debugHud = false;
  let debugDraw = false;
  let freezeCam = false;
  let recorder = createRecorder(0, 'gym');
  let maps = loadMaps();

  function show() {
    renderMenus(
      menusEl,
      menus,
      {
        local: () => {
          menus.screen = 'join';
          menus.bots = 0;
          show();
        },
        bots: () => {
          menus.screen = 'join';
          menus.bots = 3;
          menus.seats[0] = { taken: true, ready: true, color: 0, padId: 'keyboard', name: 'You' };
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
        start: () => void beginMatch(),
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
        resume: () => {
          paused = false;
          menus.screen = 'play';
          show();
        },
        quit: () => {
          sim = null;
          menus.screen = 'menu';
          show();
        },
        host: () => {
          menus.roomCode = menus.roomCode || Math.random().toString(36).slice(2, 8).toUpperCase();
          settings.maxHp = menus.maxHp;
          settings.firstTo = menus.firstTo;
          saveSettings(settings);
          menus.chat.push(`* hosted room ${menus.roomCode} (HP ${menus.maxHp}, first-to ${menus.firstTo || 'endless'})`);
          show();
        },
        joinRoom: () => {
          menus.roomCode = menus.roomCode || 'JOINME';
          menus.chat.push(`* joined ${menus.roomCode}`);
          show();
        },
        chat: (text?: string) => {
          if (!text) return;
          menus.chat.push(`you: ${text}`);
          net.send({ t: 'chat', from: 'you', text });
          show();
        },
      },
      settings,
      maps,
    );
  }

  function openEditor() {
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

  async function beginMatch() {
    const taken = menus.seats.filter((s) => s.taken).length;
    const humans = Math.max(1, taken);
    extraLevels = settings.includeUserLevels ? await loadLibrary().catch(() => []) : [];
    const pool = matchLevelPool(settings.enabledLevels, extraLevels);
    const level =
      settings.rotation === 'ordered'
        ? (pool[0] ?? gymLevel)
        : (pool[Math.floor(Math.random() * pool.length)] ?? gymLevel);
    startSim(level, { playerCount: humans, bots: menus.bots, maxHp: settings.maxHp, firstTo: settings.firstTo });
  }

  function startSim(level: LevelDef, opts: { playerCount: number; bots: number; maxHp?: number; firstTo?: number }) {
    mixer.resume();
    mixer.startMusic();
    const seed = (Math.random() * 1e9) | 0;
    recorder = createRecorder(seed, level.id);
    sim = createSimWorld({
      level,
      seed,
      extraLevels,
      settings: {
        playerCount: opts.playerCount,
        bots: opts.bots,
        maxHp: opts.maxHp ?? settings.maxHp,
        firstTo: opts.firstTo ?? settings.firstTo,
        enabledWeapons: settings.enabledWeapons,
        enabledLevels: settings.enabledLevels,
        rotation: settings.rotation,
        showWins: settings.showWins,
      },
      boxes: 8,
    });
    if (opts.bots > 0) {
      const botSlots: number[] = [];
      sim.ecs.query(Player).updateEach(([p]) => {
        if (p.slot >= opts.playerCount) botSlots.push(p.slot);
      });
      attachBots(sim.ecs, botSlots);
    }
    cam = createCamera(level.bounds);
    particles = [];
    decals.length = 0;
    menus.screen = 'play';
    show();
  }

  function padMapFor(id: string) {
    return maps[id];
  }

  function sampleInputs(): PlayerInput[] {
    const inputs = blankInputs(4);
    const pads = pollGamepads();
    pads.forEach((pad, i) => {
      if (!pad) return;
      const latch = latches[i] ?? emptyLatch();
      const aim = lastAim[i] ?? { x: 1, y: 0 };
      if (menus.screen === 'join') {
        if (pad.buttons[14]?.pressed) {
          const seat = menus.seats.find((s) => s.padId === pad.id);
          if (seat) {
            cycleSeatColor(seat, -1);
            show();
          }
        }
        if (pad.buttons[15]?.pressed) {
          const seat = menus.seats.find((s) => s.padId === pad.id);
          if (seat) {
            cycleSeatColor(seat, 1);
            show();
          }
        }
        if (pad.mapping && pad.mapping !== 'standard' && !maps[pad.id]) {
          menus.notice = `Non-standard pad “${pad.id}” — open Settings to remap.`;
        }
      }
      inputs[i] = readPad(pad, latch, aim, padMapFor(pad.id));
      lastAim[i] = { x: inputs[i]!.aimX, y: inputs[i]!.aimY };
      if (latch.pause) {
        paused = !paused;
        menus.screen = paused ? 'pause' : 'play';
        show();
        latch.pause = false;
      }
    });
    const joinedPad = pads.some(Boolean);
    if (!joinedPad || menus.seats.some((s) => s.padId === 'keyboard')) {
      const p = sim?.players()[0];
      const t = p?.get(Transform) ?? { x: 8, y: 6 };
      inputs[0] = keys.sample({ x: t.x, y: t.y }, cam, canvas.clientWidth, canvas.clientHeight);
    }
    if (keys.down.has('Escape') && menus.screen === 'play') {
      paused = true;
      menus.screen = 'pause';
      show();
    }
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

  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (renderer) renderer.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
    if (sim && menus.screen === 'play' && !paused) {
      const scale = sim.ecs.get(RoundState)?.phase === RoundPhase.LastKill ? tuning.lastKillSlowmo : 1;
      const steps = loop.consume(dt, scale);
      const sampled = sampleInputs();
      for (let i = 0; i < steps; i++) {
        recorder.push(sampled);
        const events = sim.step(sampled);
        mixer.handle(events);
        emitFromEvents(events, particles, decals);
        if (events.some((e) => e.type === 'explosion' || e.type === 'kill') && !settings.reduceShake) {
          addShake(cam, events.some((e) => e.type === 'explosion') ? 10 : 5);
        }
        if (events.some((e) => e.type === 'explosion')) rumble('boom');
        else if (events.some((e) => e.type === 'hit')) rumble('hit');
        latches.forEach(consumeLatch);
        keys.consume();
      }
      particles = stepParticles(particles, dt);
      const frame = buildFrame(
        sim,
        cam,
        interpolationAlpha(loop),
        canvas.clientWidth || 1280,
        canvas.clientHeight || 720,
        settings.reduceBlood ? [] : particles,
        { debug: debugDraw, freezeCamera: freezeCam, colorblind: settings.colorblind },
      );
      frame.hud.hash = sim.hash();
      frame.hud.gpuMs = renderer?.lastGpuMs ?? 0;
      renderer?.render(frame);
      drawHud(frame);
      window.__floppy = {
        rendererKind,
        lastHash: frame.hud.hash ?? '',
        tick: frame.hud.tick ?? 0,
        countdown: frame.hud.countdown,
        physicsMs: frame.hud.physicsMs ?? 0,
        gpuMs: frame.hud.gpuMs ?? 0,
      };
    } else if (renderer && menus.screen !== 'editor') {
      renderer.render({
        groups: [],
        camera: { x: 16, y: 9, zoom: 28, ppm: 28, shakeX: 0, shakeY: 0 },
        theme: { top: '#1b2030', bottom: '#111318', solid: '#333' },
        hud: { slowmo: false, countdown: 0 },
      });
    }
    raf = requestAnimationFrame(tick);
  }

  function drawHud(frame: ReturnType<typeof buildFrame>) {
    hudEl.innerHTML = '';
    if (frame.hud.countdown > 0) {
      const d = document.createElement('div');
      d.dataset.countdown = String(frame.hud.countdown);
      d.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:800';
      d.textContent = String(frame.hud.countdown);
      hudEl.append(d);
    }
    if (frame.hud.showWins && frame.hud.wins) {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;top:10px;left:12px;font-weight:700;text-shadow:0 1px 4px #000';
      const names = ['P1', 'P2', 'P3', 'P4'];
      bar.textContent =
        names.map((n, i) => `${n} ${frame.hud.wins![i] ?? 0}`).join('   ') +
        (frame.hud.firstTo ? `   first to ${frame.hud.firstTo}` : '');
      hudEl.append(bar);
    }
    if (frame.hud.phase === RoundPhase.Scoreboard || frame.hud.phase === RoundPhase.MatchOver) {
      const board = document.createElement('div');
      board.style.cssText =
        'position:absolute;top:20%;left:50%;transform:translateX(-50%);background:rgba(10,12,16,0.75);padding:16px 24px;border-radius:12px;text-align:center';
      board.innerHTML = `<h2 style="margin:0 0 8px">${frame.hud.phase === RoundPhase.MatchOver ? 'Match over' : 'Round over'}</h2>
        <p>${(frame.hud.wins ?? []).map((w, i) => `P${i + 1}: ${w}`).join(' · ')}</p>`;
      hudEl.append(board);
    }
    const tip = document.createElement('div');
    tip.className = 'notice';
    tip.textContent = rendererKind === 'gpu' ? 'SDF renderer' : 'Canvas fallback';
    hudEl.append(tip);
    if (debugHud) {
      const dbg = document.createElement('pre');
      dbg.style.cssText =
        'position:absolute;right:12px;top:10px;margin:0;padding:8px;background:rgba(0,0,0,0.55);font:12px/1.4 monospace';
      dbg.textContent = [
        `tick ${frame.hud.tick ?? 0}`,
        `hash ${frame.hud.hash ?? '--------'}`,
        `phys ${((frame.hud.physicsMs ?? 0)).toFixed(2)} ms`,
        `gpu  ${((frame.hud.gpuMs ?? 0)).toFixed(2)} ms`,
        `ents ${frame.hud.entities ?? 0}`,
        `rend ${rendererKind}`,
      ].join('\n');
      hudEl.append(dbg);
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
        tuning.lastKillSlowmo = tuning.lastKillSlowmo < 1 ? 1 : 0.25;
      }
      if (e.code === 'F7') freezeCam = !freezeCam;
      if (e.code === 'F8') void switchRenderer();
      if (e.code === 'F9') recorder.download();
    });
  }

  async function switchRenderer() {
    if (rendererKind === 'gpu') {
      renderer = createCanvasRenderer(canvas);
      rendererKind = 'canvas';
      menus.notice = 'Canvas fallback';
    } else if (settings.renderer !== 'canvas') {
      const gpu = await tryCreateGpuRenderer(canvas, { lighting: settings.lighting });
      if (gpu) {
        renderer = gpu;
        rendererKind = 'gpu';
        menus.notice = 'SDF renderer';
      }
    }
    if (menus.screen !== 'play') show();
  }

  return {
    async start() {
      show();
      window.addEventListener('gamepadconnected', (ev) => {
        const pad = (ev as GamepadEvent).gamepad ?? pollGamepads().find(Boolean);
        if (!pad) return;
        if (pad.mapping && pad.mapping !== 'standard' && !maps[pad.id]) {
          menus.notice = `Non-standard pad “${pad.id}” — open Settings to remap.`;
        }
        const existing = menus.seats.find((s) => s.padId === pad.id);
        if (existing && menus.screen === 'disconnect') {
          paused = false;
          menus.screen = 'play';
          show();
          return;
        }
        const seat = menus.seats.find((s) => !s.taken);
        if (seat && menus.screen === 'join') {
          seat.taken = true;
          seat.padId = pad.id;
          seat.color = menus.seats.findIndex((s) => s === seat);
          seat.ready = true;
          show();
        }
      });
      window.addEventListener('gamepaddisconnected', () => {
        if (menus.screen === 'play') {
          paused = true;
          menus.screen = 'disconnect';
          show();
        }
      });
      window.addEventListener('keydown', (e) => {
        if (menus.screen === 'join') {
          if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            const seat = [...menus.seats].reverse().find((s) => s.taken) ?? menus.seats[0];
            if (seat?.taken) {
              cycleSeatColor(seat, e.code === 'ArrowRight' ? 1 : -1);
              show();
            }
            return;
          }
          if (e.code === 'Space' || e.code === 'Enter') {
            const seat = menus.seats.find((s) => !s.taken);
            if (seat) {
              seat.taken = true;
              seat.ready = true;
              seat.padId = 'keyboard';
              seat.color = menus.seats.findIndex((s) => s === seat);
            }
            if (e.code === 'Enter') void beginMatch();
            show();
          }
        }
      });
      renderer = createCanvasRenderer(canvas);
      menus.notice = 'Canvas fallback';
      if (menus.screen !== 'play') show();
      bindDebug();
      if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
      raf = requestAnimationFrame(tick);
      if (settings.renderer !== 'canvas') {
        void tryCreateGpuRenderer(canvas, { lighting: settings.lighting })
          .then((gpu) => {
            if (!gpu) return;
            renderer = gpu;
            rendererKind = 'gpu';
            menus.notice = 'SDF renderer';
            if (menus.screen !== 'play') show();
          })
          .catch(() => undefined);
      }
      void net;
      void MatchState;
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
