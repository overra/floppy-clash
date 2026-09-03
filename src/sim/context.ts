import type { Entity, World } from 'koota';
import type { Body, World as PhysicsWorld } from 'planck';
import { IdAllocator } from '../core/ids';
import { SeededRng } from '../core/rng';
import type { SimEvent, SimEvents } from './events';
import type { PlayerInput } from './input';
import type { LevelDef } from './level/schema';
import type { MatchSettings } from './rules/settings';
import { cloneTuning, type Tuning } from './tuning';

export type SimContext = {
  ecs: World;
  physics: PhysicsWorld;
  rng: SeededRng;
  ids: IdAllocator;
  events: SimEvents;
  bodies: Map<number, Body>;
  entityOf: WeakMap<Body, Entity>;
  prevInputs: PlayerInput[];
  inputs: PlayerInput[];
  level: LevelDef;
  settings: MatchSettings;
  tuning: Tuning;
  players: Entity[];
  pendingDestroy: Entity[];
  tick: number;
  fireCd: Map<number, number>;
  contactHits: Set<number>;
  lastPhysicsMs: number;
};

const contexts = new WeakMap<World, SimContext>();

export function bindContext(world: World, ctx: SimContext): void {
  contexts.set(world, ctx);
}

export function getContext(world: World): SimContext {
  const ctx = contexts.get(world);
  if (!ctx) throw new Error('Sim context missing for world');
  return ctx;
}

export function emit(world: World, event: SimEvent): void {
  getContext(world).events.push(event);
}

export function makeContext(
  ecs: World,
  physics: PhysicsWorld,
  level: LevelDef,
  seed: number,
  settings: MatchSettings,
): SimContext {
  return {
    ecs,
    physics,
    rng: new SeededRng(seed),
    ids: new IdAllocator(),
    events: [],
    bodies: new Map(),
    entityOf: new WeakMap(),
    prevInputs: [],
    inputs: [],
    level,
    settings,
    tuning: cloneTuning(),
    players: [],
    pendingDestroy: [],
    tick: 0,
    fireCd: new Map(),
    contactHits: new Set(),
    lastPhysicsMs: 0,
  };
}
