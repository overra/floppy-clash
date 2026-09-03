import { Pane } from 'tweakpane';
import { attachBots } from './sim/ai/bots';
import { createFixedStepLoop, interpolationAlpha } from './core/loop';
import { createMixer } from './audio/mixer';
import { createKeyboardFallback } from './input/keyboard';
import { consumeLatch, emptyLatch, pollGamepads, readPad, type Latch } from './input/gamepad';
import {
  canStartMatch,
  claimDisconnectedSeat,
  collectPadMap,
  createMenuState,
  cycleSeatColor,
  markDisconnectedSeat,
  renderMenus,
  takeOrReadySeat,
  takeSeat,
} from './ui/menus';
import { scoreboardMarkup } from './ui/scoreboard';
import { loadMaps, saveMap, shouldOfferRemap } from './input/remap';
import { gymLevel } from './levels/catalog';
import { matchLevelPool } from './levels/catalog';
import { addShake, createCamera } from './render/camera';
import { buildFrame } from './render/buildFrame';
import { createCanvasRenderer, type Renderer } from './render/canvas/renderer';
import { emptyReadback, type FramebufferReadback } from './render/gpu/readback';
import { getLastGpuInitError, tryCreateGpuRenderer } from './render/gpu/renderer';
import { createDecalLayer, stampFxDecals, type PersistentDecalLayer } from './render/fx/decals';
import { emitIntoWorld, listParticles, stepFxParticles } from './render/fx/particles';
import { clearFx, createFxWorld } from './render/fx/world';
import { blankInputs, type PlayerInput } from './sim/input';
import { inspectWorld, formatInspect } from './sim/inspect';
import { primitiveSdf } from './render/sdf/primitives';
import {
  Dead,
  Health,
  MatchState,
  Player,
  RoundPhase,
  RoundState,
  Transform,
  Weapon,
} from './sim/traits';
import { createClientView, type ClientView } from './net/clientView';
import { createSimWorld, type SimHandle } from './sim/world';
import { spawnWeapon } from './sim/systems/weapons';
import { tuning } from './sim/tuning';
import { loadSettings, saveSettings, type UserSettings } from './ui/settingsStore';
import { loadStats, recordKos, recordMatch } from './ui/statsStore';
import { hostContentMessages, lateJoinSnapshotMessage } from './net/protocol';
import { drainChangeTrackers } from './sim/snapshot';
import { applyInputBundle, bundleInputs } from './net/simnet';
import { createEditorState, fromHash, loadLibrary, type EditorState } from './editor/editor';
import { mountEditor } from './editor/view';
import {
  createLocalLoopback,
  createWebRtcSession,
  signalingUrlFromLocation,
  type NetSession,
} from './net/transport';
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
  phase: number;
  forceLastStand: () => void;
  speedRounds: () => void;
  matchRound: number;
  debugDraw: boolean;
  debugHud: boolean;
  freezeCam: boolean;
  netRole: string;
  netState: string;
  netReady: boolean;
  lastSnapTick: number;
  clientViewTick: number;
  clientAppliedX: number;
  clientRestored: boolean;
  weaponCount: number;
  p0Hp: number;
  p0Dead: boolean;
  slowmo: number;
  rendererSwitches: number;
  lastReplayBytes: number;
  lastReplayName: string;
  netPeers: number;
  netSlot: number;
  entities: number;
  chatOpen: boolean;
  lastChat: string;
  lastFrameGroups: number;
  lastFrameColored: number;
  inspect: string;
  gpuPipelineBackend: 'typegpu' | 'none';
  gpuPipelineApi: 'root.createRenderPipeline' | '';
  gpuPipelineResourceType: string;
  gpuInitError: string;
  readFramebuffer: () => Promise<FramebufferReadback>;
};

declare global {
  interface Window {
    __floppy?: FloppyDebug;
  }
}

export function createGame(root: HTMLElement): Game {
  let canvas = root.querySelector('#game') as HTMLCanvasElement;
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
  const joinAHeld = [false, false, false, false];
  const joinStartHeld = [false, false, false, false];
  let renderer: Renderer | null = null;
  let rendererKind: 'gpu' | 'canvas' = 'canvas';
  let sim: SimHandle | null = null;
  let cam = createCamera(gymLevel.bounds);
  const fx = createFxWorld();
  let decalLayer: PersistentDecalLayer = createDecalLayer(gymLevel.bounds);
  let clientView: ClientView | null = null;
  let rendererSwitches = 0;
  let netName = 'guest';
  let netSlot = 0;
  let nextGuestSlot = 0;
  let pendingLevel: LevelDef | undefined;
  const remoteBySlot: Array<PlayerInput | null> = [null, null, null, null];
  const inputHist: PlayerInput[] = [];
  let chatOpen = false;
  let matchChatEl: HTMLDivElement | null = null;
  let raf = 0;
  let last = performance.now();
  let paused = false;
  let editor: EditorState | null = null;
  let pane: Pane | null = null;
  let net: NetSession = createLocalLoopback();
  let extraLevels: LevelDef[] = [];
  let debugHud = false;
  let debugDraw = false;
  let freezeCam = false;
  let recorder = createRecorder(0, 'gym');
  let maps = loadMaps();
  let hitStop = 0;
  let stats = loadStats();
  let lastFrameGroups = 0;
  let lastFrameColored = 0;

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
        start: () => startIfReady(),
        startOnline: () => {
          void beginMatch();
        },
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
          void connectLobby('host');
        },
        joinRoom: () => {
          void connectLobby('client');
        },
        chat: (text?: string) => {
          if (!text) return;
          menus.chat.push(`you: ${text}`);
          net.send({ t: 'chat', from: menus.netRole || 'you', text });
          show();
        },
      },
      settings,
      maps,
      stats,
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
    const online = menus.netRole === 'host' && net.peerCount > 0 ? 1 + net.peerCount : 0;
    const humans = online || Math.max(1, taken);
    extraLevels = settings.includeUserLevels ? await loadLibrary().catch(() => []) : [];
    const pool = matchLevelPool(settings.enabledLevels, extraLevels);
    const level =
      settings.rotation === 'ordered'
        ? (pool[0] ?? gymLevel)
        : (pool[Math.floor(Math.random() * pool.length)] ?? gymLevel);
    startSim(level, {
      playerCount: humans,
      bots: menus.bots,
      maxHp: settings.maxHp,
      firstTo: settings.firstTo,
    });
  }

  function attachNet(session: NetSession): void {
    net.close();
    net = session;
    net.onMessage((msg) => {
      if (msg.t === 'chat') {
        menus.chat.push(`${msg.from}: ${msg.text}`);
        if (menus.screen === 'lobby') show();
      }
      if (msg.t === 'settings') {
        try {
          const parsed = JSON.parse(msg.json) as { maxHp?: number; firstTo?: number };
          if (parsed.maxHp) menus.maxHp = parsed.maxHp;
          if (parsed.firstTo != null) menus.firstTo = parsed.firstTo;
          menus.notice = 'Host settings received';
        } catch {
          /* ignore */
        }
        if (menus.screen === 'lobby') show();
      }
      if (msg.t === 'level') {
        menus.notice = 'Host level JSON received';
        try {
          const parsed = JSON.parse(msg.json) as LevelDef;
          if (parsed?.id && parsed.bounds) pendingLevel = parsed;
        } catch {
          /* id-only payload */
        }
        if (menus.screen === 'lobby') show();
      }
      if (msg.t === 'input' && session.role === 'host') {
        const last = msg.bundle[msg.bundle.length - 1];
        if (last && msg.slot > 0 && msg.slot < 4) remoteBySlot[msg.slot] = last;
      }
      if (msg.t === 'event' && msg.kind === 'slot') {
        const [name, slot] = msg.payload.split(':');
        if (name === netName) netSlot = Number(slot) || 0;
      }
      if (msg.t === 'snapshot') {
        menus.lastSnapTick = msg.snap.tick;
        menus.notice = `Late-join snapshot tick ${msg.snap.tick}`;
        if (session.role === 'client') {
          if (!clientView) {
            clientView = createClientView(msg.snap, 120, pendingLevel);
            cam = createCamera(clientView.sim.ctx.level.bounds);
            clearFx(fx);
            decalLayer = createDecalLayer(clientView.sim.ctx.level.bounds);
          }
          clientView.push(performance.now(), msg.snap);
          clientView.apply(performance.now());
          if (menus.screen !== 'play') {
            menus.screen = 'play';
            show();
          }
        }
        if (menus.screen === 'lobby') show();
      }
      if (msg.t === 'event' && msg.kind === 'disconnect') {
        menus.notice = 'Peer disconnected';
        if (menus.screen === 'lobby') show();
      }
      if (msg.t === 'hello' && session.role === 'host') {
        nextGuestSlot = Math.min(3, nextGuestSlot + 1);
        session.send({ t: 'event', kind: 'slot', payload: `${msg.name}:${nextGuestSlot}` });
        for (const m of hostContentMessages(
          JSON.stringify({ maxHp: settings.maxHp, firstTo: settings.firstTo }),
          JSON.stringify(sim?.ctx.level ?? { id: 'host-level' }),
        )) {
          session.send(m);
        }
        if (sim) {
          session.send(lateJoinSnapshotMessage(sim.snapshot()));
          drainChangeTrackers(sim.ecs);
        }
      }
    });
  }

  async function connectLobby(role: 'host' | 'client'): Promise<void> {
    if (role === 'host' && !menus.roomCode) {
      menus.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    }
    menus.roomCode = (menus.roomCode || 'JOINME').toUpperCase();
    menus.netRole = role;
    menus.netState = 'connecting';
    menus.notice = role === 'host' ? `Hosting ${menus.roomCode}…` : `Joining ${menus.roomCode}…`;
    show();
    if (role === 'host') {
      settings.maxHp = menus.maxHp;
      settings.firstTo = menus.firstTo;
      saveSettings(settings);
    }
    try {
      const session = await createWebRtcSession(signalingUrlFromLocation(), menus.roomCode, role);
      attachNet(session);
      menus.netState = 'up';
      menus.chat.push(
        role === 'host'
          ? `* hosted room ${menus.roomCode} (WebRTC, HP ${menus.maxHp})`
          : `* joined ${menus.roomCode} (WebRTC)`,
      );
      if (role === 'client') {
        netName = `g${Math.random().toString(36).slice(2, 6)}`;
        session.send({ t: 'hello', name: netName });
      }
      if (role === 'host') {
        nextGuestSlot = 0;
        for (const msg of hostContentMessages(
          JSON.stringify({ maxHp: settings.maxHp, firstTo: settings.firstTo }),
          JSON.stringify(sim?.ctx.level ?? { id: 'host-level' }),
        )) {
          session.send(msg);
        }
      }
    } catch {
      menus.netState = 'error';
      menus.notice = 'Signaling failed — run npm run server (loopback still works locally).';
      attachNet(createLocalLoopback());
    }
    show();
  }

  function startIfReady() {
    if (!canStartMatch(menus.seats)) {
      menus.notice = 'Join and press A / Space again to ready, then Start.';
      show();
      return;
    }
    void beginMatch();
  }

  function startSim(
    level: LevelDef,
    opts: { playerCount: number; bots: number; maxHp?: number; firstTo?: number },
  ) {
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
    clearFx(fx);
    decalLayer = createDecalLayer(level.bounds);
    menus.screen = 'play';
    show();
    net.send({ t: 'level', json: JSON.stringify(level) });
    net.send(lateJoinSnapshotMessage(sim.snapshot()));
    drainChangeTrackers(sim.ecs);
  }

  function padMapFor(id: string) {
    return maps[id];
  }

  function sampleInputs(): PlayerInput[] {
    if (chatOpen) return blankInputs(4);
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
        const aDown = !!(pad.buttons[0]?.pressed || pad.buttons[4]?.pressed);
        if (aDown && !joinAHeld[i]) {
          takeOrReadySeat(menus.seats, pad.id);
          show();
        }
        joinAHeld[i] = aDown;
        const startDown = !!pad.buttons[9]?.pressed;
        if (startDown && !joinStartHeld[i]) startIfReady();
        joinStartHeld[i] = startDown;
      }
      inputs[i] = readPad(pad, latch, aim, padMapFor(pad.id));
      lastAim[i] = { x: inputs[i]!.aimX, y: inputs[i]!.aimY };
      if (latch.pause) {
        latch.pause = false;
        if (menus.screen === 'join') {
          startIfReady();
        } else {
          paused = !paused;
          menus.screen = paused ? 'pause' : 'play';
          show();
        }
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
    const viewSim = menus.netRole === 'client' && clientView ? clientView.sim : sim;
    if (viewSim && menus.screen === 'play' && !paused) {
      if (clientView && menus.netRole === 'client') {
        clientView.apply(performance.now());
        const sampled = sampleInputs();
        const mine = sampled[0];
        if (mine && netSlot > 0) {
          inputHist.push(mine);
          net.send(
            {
              t: 'input',
              tick: clientView.appliedTick,
              slot: netSlot,
              bundle: bundleInputs(inputHist),
            },
            false,
          );
        }
        stepFxParticles(fx, dt);
        const frame = buildFrame(
          clientView.sim,
          cam,
          clientView.alpha,
          canvas.clientWidth || 1280,
          canvas.clientHeight || 720,
          settings.reduceBlood ? [] : listParticles(fx),
          {
            debug: debugDraw,
            freezeCamera: freezeCam,
            colorblind: settings.colorblind,
            decalLayer,
            flash: hitStop,
            fxWorld: fx,
          },
        );
        frame.hud.hash = clientView.sim.hash();
        frame.hud.gpuMs = renderer?.lastGpuMs ?? 0;
        const frameSample = sampleRenderFrame(frame);
        lastFrameGroups = frameSample.groups;
        lastFrameColored = frameSample.colored;
        renderer?.render(frame);
        drawHud(frame);
        publishDebug(
          frame.hud.hash ?? '',
          frame.hud.tick ?? 0,
          frame.hud.countdown,
          frame.hud.physicsMs ?? 0,
          frame.hud.gpuMs ?? 0,
          frame.hud.phase ?? 0,
        );
        raf = requestAnimationFrame(tick);
        return;
      }
      const scale =
        viewSim.ecs.get(RoundState)?.phase === RoundPhase.LastKill ? tuning.lastKillSlowmo : 1;
      const steps = loop.consume(dt, scale);
      let sampled = sampleInputs();
      if (menus.netRole === 'host') {
        for (let s = 1; s < 4; s++) {
          const remote = remoteBySlot[s];
          if (remote) sampled = applyInputBundle(sampled, s, [remote]);
        }
      }
      for (let i = 0; i < steps; i++) {
        if (hitStop > 0) {
          hitStop -= 1;
          continue;
        }
        recorder.push(sampled);
        const events = viewSim.step(sampled);
        mixer.handle(events);
        emitIntoWorld(events, fx);
        stampFxDecals(fx, decalLayer, (d) => !settings.reduceBlood || d.kind === 'scorch');
        if (events.some((e) => e.type === 'kill')) {
          hitStop = 3;
          recordKos(events.filter((e) => e.type === 'kill').length);
        }
        if (events.some((e) => e.type === 'round-phase' && e.phase === 'match-over')) {
          const ms = viewSim.ecs.get(MatchState);
          stats = recordMatch((ms?.wins0 ?? 0) >= (ms?.firstTo || 1));
        }
        if (
          events.some((e) => e.type === 'explosion' || e.type === 'kill') &&
          !settings.reduceShake
        ) {
          addShake(cam, events.some((e) => e.type === 'explosion') ? 10 : 5);
        }
        if (events.some((e) => e.type === 'explosion')) rumble('boom');
        else if (events.some((e) => e.type === 'hit')) rumble('hit');
        if (menus.netRole === 'host') {
          for (const ev of events) {
            if (ev.type === 'round-phase')
              net.send({ t: 'event', kind: 'round-phase', payload: ev.phase });
            if (ev.type === 'spawn' || ev.type === 'despawn' || ev.type === 'shot') {
              net.send({ t: 'event', kind: ev.type, payload: JSON.stringify(ev) });
            }
          }
        }
        latches.forEach(consumeLatch);
        keys.consume();
        if (menus.netRole === 'host' && viewSim.ctx.tick % 3 === 0) {
          if (viewSim.ctx.tick % 60 === 0) {
            net.send(lateJoinSnapshotMessage(viewSim.snapshot()), false);
            drainChangeTrackers(viewSim.ecs);
          } else {
            net.send({ t: 'snapshot', snap: viewSim.snapshotDelta() }, false);
          }
        }
      }
      stepFxParticles(fx, dt);
      const frame = buildFrame(
        viewSim,
        cam,
        interpolationAlpha(loop),
        canvas.clientWidth || 1280,
        canvas.clientHeight || 720,
        settings.reduceBlood ? [] : listParticles(fx),
        {
          debug: debugDraw,
          freezeCamera: freezeCam,
          colorblind: settings.colorblind,
          decalLayer,
          flash: hitStop,
          fxWorld: fx,
        },
      );
      frame.hud.hash = viewSim.hash();
      frame.hud.gpuMs = renderer?.lastGpuMs ?? 0;
      const frameSample = sampleRenderFrame(frame);
      lastFrameGroups = frameSample.groups;
      lastFrameColored = frameSample.colored;
      renderer?.render(frame);
      drawHud(frame);
      publishDebug(
        frame.hud.hash ?? '',
        frame.hud.tick ?? 0,
        frame.hud.countdown,
        frame.hud.physicsMs ?? 0,
        frame.hud.gpuMs ?? 0,
        frame.hud.phase ?? 0,
      );
    } else if (renderer && menus.screen !== 'editor') {
      renderer.render({
        groups: [],
        camera: { x: 16, y: 9, zoom: 28, ppm: 28, shakeX: 0, shakeY: 0 },
        theme: { top: '#1b2030', bottom: '#111318', solid: '#333' },
        hud: { slowmo: false, countdown: 0 },
      });
    }
    if (menus.screen !== 'play') publishDebug('', sim?.getTick() ?? 0, 0, 0, 0, 0);
    raf = requestAnimationFrame(tick);
  }

  function publishDebug(
    hash: string,
    tick: number,
    countdown: number,
    physicsMs: number,
    gpuMs: number,
    phase: number,
  ): void {
    window.__floppy = {
      rendererKind,
      lastHash: hash,
      tick,
      countdown,
      physicsMs,
      gpuMs,
      phase,
      debugDraw,
      debugHud,
      freezeCam,
      netRole: menus.netRole,
      netState: menus.netState,
      netReady: net.ready,
      lastSnapTick: menus.lastSnapTick,
          forceLastStand: () => {
        if (!sim) return;
        sim.players().forEach((p) => {
          const slot = p.get(Player)?.slot ?? 0;
          if (slot !== 0) p.set(Health, { hp: 0, maxHp: p.get(Health)?.maxHp ?? 100 });
        });
      },
      speedRounds: () => {
        if (!sim) return;
        sim.ctx.tuning.countdownTicks = 3;
        sim.ctx.tuning.slowmoTicks = 2;
        sim.ctx.tuning.scoreboardTicks = 2;
      },
      matchRound: sim?.ecs.get(MatchState)?.round ?? 0,
      clientViewTick: clientView?.appliedTick ?? 0,
      clientAppliedX: clientView?.appliedX ?? 0,
      clientRestored: clientView?.restored ?? false,
      weaponCount: countWeapons(),
      p0Hp: (sim ?? clientView?.sim)?.players()[0]?.get(Health)?.hp ?? 0,
      p0Dead: (sim ?? clientView?.sim)?.players()[0]?.has(Dead) ?? false,
      slowmo: tuning.lastKillSlowmo,
      rendererSwitches,
      lastReplayBytes: recorder.lastBytes(),
      lastReplayName: recorder.lastName(),
      netPeers: net.peerCount,
      netSlot,
      entities: sim?.ctx.bodies.size ?? clientView?.sim.ctx.bodies.size ?? 0,
      chatOpen,
      lastChat: menus.chat[menus.chat.length - 1] ?? '',
      lastFrameGroups,
      lastFrameColored,
      gpuPipelineBackend: renderer?.pipelineBackend ?? 'none',
      gpuPipelineApi: renderer?.pipelineApi ?? '',
      gpuPipelineResourceType: renderer?.pipelineResourceType ?? '',
      gpuInitError: getLastGpuInitError(),
      readFramebuffer: () =>
        renderer?.readFramebuffer() ?? Promise.resolve(emptyReadback('unavailable', 'no-renderer')),
      inspect:
        (sim ?? clientView?.sim)
          ? formatInspect(inspectWorld((sim ?? clientView!.sim).ecs, 12))
          : '',
    };
  }

  function sampleRenderFrame(frame: ReturnType<typeof buildFrame>): {
    groups: number;
    colored: number;
  } {
    let colored = 0;
    for (const g of frame.groups) {
      for (const p of g.primitives) {
        if (primitiveSdf(p, { x: p.ax, y: p.ay }) < 0.25) colored += 1;
      }
    }
    return { groups: frame.groups.length, colored };
  }

  function countWeapons(): number {
    const w = sim?.ecs ?? clientView?.sim.ecs;
    if (!w) return 0;
    let n = 0;
    w.query(Weapon).updateEach(() => {
      n += 1;
    });
    return n;
  }

  function drawHud(frame: ReturnType<typeof buildFrame>) {
    if (matchChatEl && matchChatEl.parentElement === hudEl) matchChatEl.remove();
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
      bar.style.cssText =
        'position:absolute;top:10px;left:12px;font-weight:700;text-shadow:0 1px 4px #000';
      const names = ['P1', 'P2', 'P3', 'P4'];
      bar.textContent =
        names.map((n, i) => `${n} ${frame.hud.wins![i] ?? 0}`).join('   ') +
        (frame.hud.firstTo ? `   first to ${frame.hud.firstTo}` : '');
      hudEl.append(bar);
    }
    if (
      frame.hud.phase === RoundPhase.LastKill ||
      frame.hud.phase === RoundPhase.Scoreboard ||
      frame.hud.phase === RoundPhase.MatchOver
    ) {
      const title =
        frame.hud.phase === RoundPhase.MatchOver
          ? 'Match over'
          : frame.hud.phase === RoundPhase.LastKill
            ? 'Last standing'
            : 'Round over';
      hudEl.insertAdjacentHTML(
        'beforeend',
        scoreboardMarkup({
          title,
          wins: frame.hud.wins ?? [0, 0, 0, 0],
          firstTo: frame.hud.firstTo,
        }),
      );
    }
    const tip = document.createElement('div');
    tip.className = 'notice';
    tip.textContent = rendererKind === 'gpu' ? 'SDF renderer' : 'Canvas fallback';
    hudEl.append(tip);
    if (debugHud) {
      const players = sim
        ? sim.players().map((e, i) => {
            const slot = e.get(Player)?.slot ?? i;
            const hpNow = e.get(Health)?.hp ?? 0;
            const dead = e.has(Dead) ? ' dead' : '';
            return `P${slot + 1} hp ${hpNow.toFixed(0)}${dead}`;
          })
        : [];
      const dbg = document.createElement('pre');
      dbg.style.cssText =
        'position:absolute;right:12px;top:10px;margin:0;padding:8px;background:rgba(0,0,0,0.55);font:12px/1.4 monospace';
      dbg.textContent = [
        `tick ${frame.hud.tick ?? 0}`,
        `hash ${frame.hud.hash ?? '--------'}`,
        `phys ${(frame.hud.physicsMs ?? 0).toFixed(2)} ms`,
        `gpu  ${(frame.hud.gpuMs ?? 0).toFixed(2)} ms`,
        `ents ${frame.hud.entities ?? 0}`,
        `weap ${countWeapons()}`,
        `rend ${rendererKind}`,
        `phase ${frame.hud.phase ?? 0}`,
        `peers ${net.peerCount}`,
        ...players,
        '--- traits ---',
        sim ? formatInspect(inspectWorld(sim.ecs, 10)) : '',
      ].join('\n');
      hudEl.append(dbg);
    }
    if (menus.netRole === 'host' || menus.netRole === 'client') {
      if (!matchChatEl) {
        matchChatEl = document.createElement('div');
        matchChatEl.id = 'matchchat';
        matchChatEl.dataset.matchChat = '1';
        matchChatEl.style.cssText =
          'position:absolute;left:12px;bottom:12px;min-width:220px;max-width:40%;padding:8px;background:rgba(10,12,16,0.65);border-radius:8px;font:12px/1.4 monospace;white-space:pre-wrap';
        const log = document.createElement('pre');
        log.id = 'matchchat-log';
        log.style.cssText = 'margin:0 0 6px;max-height:120px;overflow:auto';
        matchChatEl.append(log);
      }
      const log = matchChatEl.querySelector('#matchchat-log');
      if (log) log.textContent = menus.chat.slice(-6).join('\n') || '(chat — Enter to type)';
      let input = matchChatEl.querySelector('#matchchat-in') as HTMLInputElement | null;
      if (chatOpen && !input) {
        input = document.createElement('input');
        input.id = 'matchchat-in';
        input.placeholder = 'Message';
        input.style.cssText = 'width:100%;box-sizing:border-box';
        matchChatEl.append(input);
        requestAnimationFrame(() => input?.focus());
      }
      if (!chatOpen && input) input.remove();
      hudEl.append(matchChatEl);
    }
  }

  function bindDebug() {
    type PaneUi = { addBinding: (o: object, k: string) => void; hidden: boolean };
    pane = new Pane({ title: 'Tuning' });
    const ui = pane as unknown as PaneUi;
    for (const key of Object.keys(tuning) as (keyof typeof tuning)[]) {
      if (typeof tuning[key] === 'number') ui.addBinding(tuning, key);
    }
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

  function replaceGameCanvas(): HTMLCanvasElement {
    const next = canvas.cloneNode(false) as HTMLCanvasElement;
    next.id = 'game';
    canvas.replaceWith(next);
    canvas = next;
    return canvas;
  }

  /** PLAN §4.11 boot: probe WebGPU/TypeGPU first; Canvas only after a failed probe. */
  async function attachPreferredRenderer(): Promise<void> {
    if (settings.renderer !== 'canvas') {
      const gpu = await tryCreateGpuRenderer(canvas, { lighting: settings.lighting });
      if (gpu) {
        renderer = gpu;
        rendererKind = 'gpu';
        menus.notice = 'SDF renderer';
        return;
      }
    }
    renderer = createCanvasRenderer(canvas);
    rendererKind = 'canvas';
    menus.notice = 'Canvas fallback';
  }

  async function switchRenderer() {
    rendererSwitches += 1;
    replaceGameCanvas();
    if (rendererKind === 'gpu' || settings.renderer === 'canvas') {
      renderer = createCanvasRenderer(canvas);
      rendererKind = 'canvas';
      menus.notice = 'Canvas fallback';
    } else {
      const gpu = await tryCreateGpuRenderer(canvas, { lighting: settings.lighting });
      if (gpu) {
        renderer = gpu;
        rendererKind = 'gpu';
        menus.notice = 'SDF renderer';
      } else {
        renderer = createCanvasRenderer(canvas);
        rendererKind = 'canvas';
        menus.notice = 'Canvas fallback';
      }
    }
    renderer.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
    if (menus.screen !== 'play') show();
  }

  return {
    async start() {
      show();
      window.addEventListener('gamepadconnected', (ev) => {
        const pad = (ev as GamepadEvent).gamepad ?? pollGamepads().find(Boolean);
        if (!pad) return;
        if (shouldOfferRemap(pad.mapping ?? '', pad.id, maps)) {
          menus.notice = `Non-standard pad “${pad.id}” — remap offered.`;
          menus.screen = 'settings';
          show();
          return;
        }
        const existing = menus.seats.find((s) => s.padId === pad.id);
        if (existing && menus.screen === 'disconnect') {
          menus.claimSeat = -1;
          paused = false;
          menus.screen = 'play';
          show();
          return;
        }
        if (menus.screen === 'disconnect') {
          claimDisconnectedSeat(menus.seats, pad.id, menus.claimSeat);
          menus.claimSeat = -1;
          paused = false;
          menus.screen = 'play';
          show();
          return;
        }
        if (menus.screen === 'join') {
          takeSeat(menus.seats, pad.id);
          show();
        }
      });
      window.addEventListener('gamepaddisconnected', (ev) => {
        const pad = (ev as GamepadEvent).gamepad;
        menus.claimSeat = markDisconnectedSeat(menus.seats, pad?.id);
        if (menus.screen === 'play') {
          paused = true;
          menus.screen = 'disconnect';
          show();
        }
      });
      window.addEventListener('keydown', (e) => {
        const online = menus.netRole === 'host' || menus.netRole === 'client';
        if (menus.screen === 'play' && online && (e.code === 'Enter' || e.code === 'Escape')) {
          if (e.code === 'Enter') {
            e.preventDefault();
            if (!chatOpen) {
              chatOpen = true;
            } else {
              const typed = (
                document.querySelector('#matchchat-in') as HTMLInputElement | null
              )?.value.trim();
              if (typed) {
                menus.chat.push(`you: ${typed}`);
                net.send({ t: 'chat', from: netName || menus.netRole || 'you', text: typed });
              }
              chatOpen = false;
            }
            return;
          }
          if (e.code === 'Escape' && chatOpen) {
            e.preventDefault();
            chatOpen = false;
            return;
          }
        }
        if (menus.screen === 'join') {
          if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            const seat = [...menus.seats].reverse().find((s) => s.taken) ?? menus.seats[0];
            if (seat?.taken) {
              cycleSeatColor(seat, e.code === 'ArrowRight' ? 1 : -1);
              show();
            }
            return;
          }
          if (e.code === 'Space' || e.code === 'KeyA') {
            takeOrReadySeat(menus.seats, 'keyboard');
            show();
            return;
          }
          if (e.code === 'Enter') {
            startIfReady();
            return;
          }
        }
      });
      await attachPreferredRenderer();
      if (menus.screen !== 'play') show();
      bindDebug();
      if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
      raf = requestAnimationFrame(tick);
      void net;
      void MatchState;
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
