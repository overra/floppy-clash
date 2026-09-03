import { createWorld, type Entity, type World } from 'koota';
import { World as PhysicsWorld } from 'planck';
import { thinkBosses } from './ai/boss';
import { attachBots, thinkBots } from './ai/bots';
import { stepArms } from './player/arms';
import { bindContext, getContext, makeContext, type SimContext } from './context';
import type { SimEvents } from './events';
import { blankInputs, normalizeInput, type PlayerInput } from './input';
import { loadLevel, spawnPlayer } from './level/loader';
import type { LevelDef } from './level/schema';
import { assignNetId, createBoxBody, registerBody } from './physics/bodies';
import { bindContactRouter } from './physics/contacts';
import { cloneTuning } from './tuning';
import { mergeSettings, type MatchSettings } from './rules/settings';
import { hashWorld, serializeDelta, serializeWorld } from './snapshot';
import { combat } from './player/combat';
import { controller } from './player/controller';
import { rules } from './rules/rounds';
import { spawner } from './rules/spawner';
import { applyInputs } from './systems/applyInputs';
import { cleanup } from './systems/cleanup';
import { damageDeath } from './systems/damage';
import { hazardsStep } from './systems/hazards';
import { physicsStep, syncTransforms } from './systems/syncTransforms';
import { projectiles } from './weapons/projectiles';
import { syncHeldWeapons, weapons } from './weapons/systems';
import { DropState, MatchState, PrevTransform, RoundPhase, RoundState, SimClock, Transform } from './traits';

export type CreateSimOptions = {
  level: LevelDef;
  seed: number;
  settings?: Partial<MatchSettings>;
  spawnPlayers?: boolean;
  boxes?: number;
  extraLevels?: LevelDef[];
};

export type SimHandle = {
  ecs: World;
  ctx: SimContext;
  step: (inputs?: PlayerInput[]) => SimEvents;
  getTick: () => number;
  hash: () => string;
  snapshot: () => ReturnType<typeof serializeWorld>;
  snapshotDelta: () => ReturnType<typeof serializeDelta>;
  players: () => Entity[];
};

export function createSimWorld(opts: CreateSimOptions): SimHandle {
  const settings = mergeSettings(opts.settings);
  const ecs = createWorld();
  const g = cloneTuning().gravity;
  const physics = new PhysicsWorld({ gravity: { x: 0, y: -g } });
  const ctx = makeContext(ecs, physics, opts.level, opts.seed, settings);
  ctx.extraLevels = opts.extraLevels ?? [];
  bindContext(ecs, ctx);
  bindContactRouter(physics, ctx);

  ecs.add(
    RoundState({ phase: RoundPhase.Loading, ticks: 0, aliveMask: 0, lastKiller: -1, seed: opts.seed }),
    MatchState({
      wins0: 0,
      wins1: 0,
      wins2: 0,
      wins3: 0,
      firstTo: settings.firstTo,
      levelIndex: 0,
      rotation: settings.rotation === 'ordered' ? 1 : 0,
      showWins: settings.showWins ? 1 : 0,
      maxHp: settings.maxHp,
      round: 0,
    }),
    SimClock({ tick: 0, stepScale: 1 }),
    DropState({ nextDrop: Number.MAX_SAFE_INTEGER, looseCount: 0 }),
  );

  loadLevel(ecs, opts.level);

  if (opts.spawnPlayers !== false) {
    const count = Math.max(1, Math.min(4, settings.playerCount + settings.bots));
    const order = ctx.rng.shuffle(opts.level.spawns.slice());
    for (let i = 0; i < count; i++) {
      const spawn = order[i % order.length]!;
      spawnPlayer(ecs, i, spawn.x, spawn.y + 1, i, i);
    }
    const botSlots: number[] = [];
    for (let i = settings.playerCount; i < count; i++) botSlots.push(i);
    if (botSlots.length) attachBots(ecs, botSlots);
  }

  if (opts.boxes && opts.boxes > 0) {
    spawnTestBoxes(ecs, opts.boxes);
  }

  const step = (inputs?: PlayerInput[]): SimEvents => {
    ctx.events = [];
    ctx.contactHits.clear();
    ctx.prevInputs = ctx.inputs.map((i) => ({ ...i }));
    const incoming = inputs ?? blankInputs(4);
    ctx.rawInputs = incoming.map((i) => ({ ...i }));
    ctx.inputs = incoming.map(normalizeInput);
    thinkBots(ecs);
    thinkBosses(ecs);
    applyInputs(ecs);
    controller(ecs);
    stepArms(ecs);
    combat(ecs);
    weapons(ecs);
    projectiles(ecs);
    hazardsStep(ecs);
    physicsStep(ecs);
    syncTransforms(ecs);
    syncHeldWeapons(ecs);
    damageDeath(ecs);
    rules(ecs);
    spawner(ecs);
    cleanup(ecs);
    ctx.tick += 1;
    ecs.set(SimClock, { tick: ctx.tick, stepScale: 1 });
    return ctx.events;
  };

  return {
    ecs,
    ctx,
    step,
    getTick: () => ctx.tick,
    hash: () => hashWorld(ecs),
    snapshot: () => serializeWorld(ecs),
    snapshotDelta: () => serializeDelta(ecs),
    players: () => ctx.players.slice(),
  };
}

function spawnTestBoxes(world: World, count: number): void {
  const ctx = getContext(world);
  for (let i = 0; i < count; i++) {
    const x = 8 + (i % 6) * 1.2;
    const y = 10 + Math.floor(i / 6) * 1.2;
    const e = world.spawn(Transform({ x, y, angle: 0 }), PrevTransform({ x, y, angle: 0 }));
    assignNetId(world, e);
    const body = createBoxBody(ctx.physics, e, 'prop', x, y, 0.4, 0.4, 'dynamic', {
      density: 1,
      friction: 0.4,
      restitution: 0.05,
      fixedRotation: false,
    });
    registerBody(world, e, body);
  }
}
