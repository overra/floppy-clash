import type { Entity, World } from 'koota';
import { builtInMatchLevels } from '../../levels/catalog';
import { getContext } from '../context';
import { loadLevel } from '../level/loader';
import { createPlayerCapsule } from '../physics/bodies';
import {
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
  Transform,
  Weapon,
} from '../traits';

export function nextMatchLevel(world: World): void {
  const ctx = getContext(world);
  const match = world.get(MatchState);
  if (!match) return;
  const pool = builtInMatchLevels().filter(
    (l) => ctx.settings.enabledLevels === 'all' || ctx.settings.enabledLevels.includes(l.id),
  );
  if (pool.length === 0) return;
  if (match.rotation === 1) {
    match.levelIndex = (match.levelIndex + 1) % pool.length;
  } else {
    let next = ctx.rng.nextInt(pool.length);
    if (pool.length > 1 && next === match.levelIndex) next = (next + 1) % pool.length;
    match.levelIndex = next;
  }
  const level = pool[match.levelIndex]!;
  reloadLevel(world, level);
}

export function reloadLevel(world: World, level: ReturnType<typeof builtInMatchLevels>[number]): void {
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
  ctx.level = level;
  loadLevel(world, level);
}

export function respawnPlayers(world: World): void {
  const ctx = getContext(world);
  const order = ctx.rng.shuffle(ctx.level.spawns.slice());
  ctx.players.forEach((player, i) => {
    if (!world.has(player)) return;
    if (player.has(Dead)) player.remove(Dead);
    const hp = ctx.settings.maxHp;
    player.set(Health, { hp, maxHp: hp });
    if (!player.get(Combat)) {
      player.add(
        Combat({
          punchCooldown: 0,
          punchActive: 0,
          blockMeter: 1,
          blockStartTick: -999,
          blocking: false,
          refillDelay: 0,
        }),
      );
    } else {
      player.set(Combat, {
        punchCooldown: 0,
        punchActive: 0,
        blockMeter: 1,
        blockStartTick: -999,
        blocking: false,
        refillDelay: 0,
      });
    }
    const status = player.get(Status);
    if (status) player.set(Status, { burning: 0, slowed: 0, glued: 0, bubbled: 0 });
    const spawn = order[i % order.length]!;
    const x = spawn.x;
    const y = spawn.y + 1;
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
  });
}
