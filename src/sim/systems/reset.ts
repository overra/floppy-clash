import type { Entity, World } from 'koota';
import { matchLevelPool } from '../../levels/catalog';
import { emit, getContext } from '../context';
import { applyLevelSwitches, loadLevel } from '../level/loader';
import type { LevelDef } from '../level/schema';
import { spawnPositions } from '../level/spawns';
import { createPlayerCapsule } from '../physics/bodies';
import {
  Bot,
  Combat,
  Controller,
  Dead,
  Hazard,
  Health,
  MatchState,
  Player,
  Projectile,
  RagdollPart,
  PhysBody,
  Snake,
  Solid,
  SpawnPoint,
  Status,
  Stocks,
  Transform,
  Weapon,
} from '../traits';

export function nextMatchLevel(world: World): void {
  const ctx = getContext(world);
  const match = world.get(MatchState);
  if (!match) return;
  const pool = matchLevelPool(ctx.settings.enabledLevels, ctx.extraLevels, ctx.settings.mode);
  if (pool.length === 0) return;
  // Rotate relative to the arena actually on screen, not whatever index was last stored.
  const current = pool.findIndex((l) => l.id === ctx.level.id);
  if (match.rotation === 1) {
    match.levelIndex = (current + 1) % pool.length;
  } else {
    let next = ctx.rng.nextInt(pool.length);
    if (pool.length > 1 && next === current) next = (next + 1) % pool.length;
    match.levelIndex = next;
  }
  // world.get hands out a snapshot: the new index has to be written back or every round re-rolls from stale state.
  world.set(MatchState, match);
  const level = pool[match.levelIndex]!;
  reloadLevel(world, level);
}

export function reloadLevel(world: World, level: LevelDef): void {
  const ctx = getContext(world);
  const doomed: Entity[] = [];
  world.query(Hazard).updateEach((_, e) => doomed.push(e));
  world.query(Solid).updateEach((_, e) => doomed.push(e));
  world.query(SpawnPoint).updateEach((_, e) => doomed.push(e));
  world.query(Projectile).updateEach((_, e) => doomed.push(e));
  world.query(RagdollPart).updateEach((_, e) => doomed.push(e));
  world.query(Snake).updateEach((_, e) => doomed.push(e));
  world.query(Weapon).updateEach((_, e) => doomed.push(e));
  world.query(Player, Dead).updateEach((_, e) => {
    if (!ctx.players.includes(e)) doomed.push(e);
  });
  const seen = new Set<Entity>();
  for (const entity of doomed) {
    if (seen.has(entity) || !world.has(entity)) continue;
    seen.add(entity);
    const body = ctx.bodies.get(entity);
    if (body) {
      ctx.physics.destroyBody(body);
      ctx.bodies.delete(entity);
    }
    entity.destroy();
  }
  ctx.level = applyLevelSwitches(level, ctx.settings);
  loadLevel(world, ctx.level);
}

export function respawnPlayers(world: World): void {
  const ctx = getContext(world);
  const spots = spawnPositions(ctx.level.spawns, ctx.players.length, ctx.rng, ctx.settings.fixedSpawns);
  ctx.players.forEach((player, i) => {
    if (!world.has(player)) return;
    const spawn = spots[i]!;
    reviveFighter(world, player, spawn.x, spawn.y, 0);
    player.set(Stocks, { left: ctx.settings.stocks, respawnIn: 0 });
    // A new arena means a new nav graph: forget the old surface, target and grudges.
    const bot = player.get(Bot);
    if (bot) player.set(Bot, { ...bot, mode: 0, timer: 0, target: -1, surf: -1, detour: 0, blocked: 0, shunned: -1, shunTicks: 0 });
  });
}

/**
 * Launch mode: a fallen fighter with stocks left drops back in on the spawn point farthest from the
 * living opposition (or their own slot's point when spawns are fixed), immune for a moment.
 */
export function respawnOne(world: World, player: Entity): void {
  const ctx = getContext(world);
  const spot = respawnSpot(world, player);
  reviveFighter(world, player, spot.x, spot.y, ctx.tuning.respawnInvulnTicks);
  const stocks = player.get(Stocks);
  if (stocks) player.set(Stocks, { ...stocks, respawnIn: 0 });
  const bot = player.get(Bot);
  if (bot) player.set(Bot, { ...bot, mode: 0, timer: 0, target: -1, surf: -1, detour: 0, blocked: 0 });
  emit(world, { type: 'respawn', player, x: spot.x, y: spot.y });
}

function respawnSpot(world: World, player: Entity): { x: number; y: number } {
  const ctx = getContext(world);
  const spawns = ctx.level.spawns;
  if (spawns.length === 0) return { x: 6, y: 7 };
  if (ctx.settings.fixedSpawns) {
    const s = spawns[Math.max(0, ctx.players.indexOf(player)) % spawns.length]!;
    return { x: s.x, y: s.y + 1 };
  }
  let best = spawns[0]!;
  let bestScore = -1;
  for (const s of spawns) {
    let score = Infinity;
    for (const other of ctx.players) {
      if (other === player || other.has(Dead)) continue;
      const t = other.get(Transform);
      if (t) score = Math.min(score, Math.hypot(t.x - s.x, t.y - s.y));
    }
    if (score === Infinity) score = 0;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return { x: best.x, y: best.y + 1 };
}

/** Full reset of one fighter at (x, y): alive, healthy, unarmed stance, fresh body if the old one is gone. */
function reviveFighter(world: World, player: Entity, x: number, y: number, invuln: number): void {
  const ctx = getContext(world);
  if (player.has(Dead)) player.remove(Dead);
  const hp = ctx.settings.maxHp;
  player.set(Health, { hp, maxHp: hp, percent: 0 });
  const stance = {
    punchCooldown: 0,
    punchActive: 0,
    punchPending: 0,
    stun: 0,
    blockMeter: 1,
    blockStartTick: -999,
    blocking: false,
    refillDelay: 0,
  };
  if (!player.get(Combat)) player.add(Combat(stance));
  else player.set(Combat, stance);
  const status = player.get(Status);
  if (status) player.set(Status, { burning: 0, slowed: 0, glued: 0, bubbled: 0, pulled: 0, invuln });
  let body = ctx.bodies.get(player);
  if (!body) {
    if (player.get(PhysBody)) player.remove(PhysBody);
    body = createPlayerCapsule(world, player, x, y);
  } else {
    body.setPosition({ x, y });
    body.setLinearVelocity({ x: 0, y: 0 });
    body.setAwake(true);
  }
  player.set(Transform, { x, y, angle: 0 });
  const ctrl = player.get(Controller);
  if (ctrl) {
    player.set(Controller, {
      ...ctrl,
      grounded: false,
      wallDir: 0,
      coyote: 0,
      jumpBuffer: 0,
      lockTicks: 0,
      ducking: false,
      wallSliding: false,
      vx: 0,
      vy: 0,
    });
  }
}
