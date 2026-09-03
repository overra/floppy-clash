import { Pane } from 'tweakpane';
import { attachBots } from './sim/ai/bots';
import { createFixedStepLoop, interpolationAlpha } from './core/loop';
import { createMixer } from './audio/mixer';
import { createKeyboardFallback } from './input/keyboard';
import { consumeLatch, emptyLatch, pollGamepads, readPad, type Latch } from './input/gamepad';
import { builtInMatchLevels, gymLevel } from './levels/catalog';
import { addShake, createCamera } from './render/camera';
import { buildFrame } from './render/buildFrame';
import { createCanvasRenderer, type Renderer } from './render/canvas/renderer';
import { tryCreateGpuRenderer } from './render/gpu/renderer';
import { emitFromEvents, stepParticles, type Decal, type Particle } from './render/fx/particles';
import { blankInputs, type PlayerInput } from './sim/input';
import { Player, RoundPhase, RoundState, Transform } from './sim/traits';
import { createSimWorld, type SimHandle } from './sim/world';
import { tuning } from './sim/tuning';
import { createMenuState, renderMenus } from './ui/menus';
import { loadSettings, saveSettings } from './ui/settingsStore';
import { createEditorState, fromHash, type EditorState } from './editor/editor';
import { mountEditor } from './editor/view';
import { createLocalLoopback } from './net/transport';
import type { LevelDef } from './sim/level/schema';

export type Game = {
  start: () => Promise<void>;
  stop: () => void;
};

export function createGame(root: HTMLElement): Game {
  const canvas = root.querySelector('#game') as HTMLCanvasElement;
  const menusEl = root.querySelector('#menus') as HTMLElement;
  const hudEl = root.querySelector('#hud') as HTMLElement;
  const settings = loadSettings();
  const menus = createMenuState();
  const keys = createKeyboardFallback();
  const mixer = createMixer();
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

  function show() {
    renderMenus(menusEl, menus, {
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
      start: () => beginMatch(),
      back: () => {
        menus.screen = 'menu';
        show();
      },
      save: () => {
        settings.maxHp = menus.maxHp;
        settings.firstTo = menus.firstTo;
        saveSettings(settings);
        menus.screen = 'menu';
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
        menus.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        show();
      },
      joinRoom: () => {
        menus.roomCode = menus.roomCode || 'JOINME';
        show();
      },
    });
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

  function beginMatch() {
    const taken = menus.seats.filter((s) => s.taken).length;
    const humans = Math.max(1, taken);
    const levels = builtInMatchLevels();
    const level = levels[Math.floor(Math.random() * levels.length)] ?? gymLevel;
    startSim(level, { playerCount: humans, bots: menus.bots, maxHp: settings.maxHp, firstTo: settings.firstTo });
  }

  function startSim(level: LevelDef, opts: { playerCount: number; bots: number; maxHp?: number; firstTo?: number }) {
    mixer.resume();
    sim = createSimWorld({
      level,
      seed: (Math.random() * 1e9) | 0,
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

  function sampleInputs(): PlayerInput[] {
    const inputs = blankInputs(4);
    const pads = pollGamepads();
    pads.forEach((pad, i) => {
      if (!pad) return;
      const latch = latches[i] ?? emptyLatch();
      const aim = lastAim[i] ?? { x: 1, y: 0 };
      inputs[i] = readPad(pad, latch, aim);
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

  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (renderer) renderer.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
    if (sim && menus.screen === 'play' && !paused) {
      const scale = sim.ecs.get(RoundState)?.phase === RoundPhase.LastKill ? tuning.lastKillSlowmo : 1;
      const steps = loop.consume(dt, scale);
      const sampled = sampleInputs();
      for (let i = 0; i < steps; i++) {
        const events = sim.step(sampled);
        mixer.handle(events);
        emitFromEvents(events, particles, decals);
        if (events.some((e) => e.type === 'explosion' || e.type === 'kill') && !settings.reduceShake) {
          addShake(cam, events.some((e) => e.type === 'explosion') ? 10 : 5);
        }
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
      );
      renderer?.render(frame);
      drawHud(frame.hud.countdown);
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

  function drawHud(countdown: number) {
    hudEl.innerHTML = '';
    if (countdown > 0) {
      const d = document.createElement('div');
      d.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:800';
      d.textContent = String(countdown);
      hudEl.append(d);
    }
    const tip = document.createElement('div');
    tip.className = 'notice';
    tip.textContent = rendererKind === 'gpu' ? 'SDF renderer' : 'Canvas fallback';
    hudEl.append(tip);
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
      if (e.code === 'F2') ui.hidden = !ui.hidden;
    });
  }

  return {
    async start() {
      show();
      window.addEventListener('gamepadconnected', () => {
        const pads = pollGamepads();
        pads.forEach((pad) => {
          if (!pad) return;
          const seat = menus.seats.find((s) => !s.taken);
          if (seat && menus.screen === 'join') {
            seat.taken = true;
            seat.padId = pad.id;
            seat.color = menus.seats.findIndex((s) => s === seat);
            seat.ready = true;
            show();
          }
        });
      });
      window.addEventListener('gamepaddisconnected', () => {
        if (menus.screen === 'play') {
          paused = true;
          menus.screen = 'disconnect';
          show();
        }
      });
      window.addEventListener('keydown', (e) => {
        if (menus.screen === 'join' && (e.code === 'Space' || e.code === 'Enter')) {
          const seat = menus.seats.find((s) => !s.taken);
          if (seat) {
            seat.taken = true;
            seat.ready = true;
            seat.padId = 'keyboard';
            seat.color = menus.seats.findIndex((s) => s === seat);
          }
          if (e.code === 'Enter') beginMatch();
          show();
        }
      });
      if (settings.renderer !== 'canvas') {
        try {
          const gpu = await tryCreateGpuRenderer(canvas);
          if (gpu) {
            renderer = gpu;
            rendererKind = 'gpu';
          }
        } catch {
          renderer = null;
        }
      }
      if (!renderer) renderer = createCanvasRenderer(canvas);
      menus.notice = rendererKind === 'gpu' ? 'SDF renderer' : 'Canvas fallback';
      if (menus.screen !== 'play') show();
      bindDebug();
      if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
      raf = requestAnimationFrame(tick);
      void net;
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
