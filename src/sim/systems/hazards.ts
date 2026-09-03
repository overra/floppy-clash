import { createQuery, Not, type Entity, type World } from 'koota';
import { emit, getContext } from '../context';
import { moduleForKind } from '../hazards';
import { assignNetId, createBoxBody, registerBody } from '../physics/bodies';
import { applyExplosion } from '../physics/queries';
import { takeDamage } from '../player/health';
import type { FixtureUserData } from '../physics/categories';
import {
  Controller,
  Dead,
  Destructible,
  Hazard,
  HazardKind,
  Lifetime,
  Player,
  PrevTransform,
  Transform,
} from '../traits';
import { spawnSnake } from '../weapons/projectiles';

const hazards = createQuery(Hazard, Transform);

export function hazardsStep(world: World): void {
  const ctx = getContext(world);
  const dt = 1 / ctx.tuning.tickRate;

  world.query(hazards).updateEach(([hz, tr], entity) => {
    moduleForKind(hz.kind)?.step?.(world, entity, hz, tr, dt);
  });

  world.query(Player, Transform, Controller, Not(Dead)).updateEach(([_p, _pt, ctrl], player) => {
    world.query(hazards).updateEach(([hz, ht], hazard) => {
      const pt = player.get(Transform);
      if (!pt) return;
      const dx = Math.abs(pt.x - ht.x);
      const dy = Math.abs(pt.y - ht.y);
      const hung = hz.kind === HazardKind.Chain && hz.param3 === 1;
      const reach = hung ? Math.max(2.2, (hz.param0 || 2.8) / 2 + 0.5) : 1.6;
      const prev = hazard.get(PrevTransform);
      const pprev = player.get(PrevTransform);
      const body = ctx.bodies.get(hazard);
      const pos = body?.getPosition();
      // Last-tick pose + this-tick commanded body (path teleport). Never vel*dt.
      const sweep =
        hz.kind === HazardKind.Saw ||
        hz.kind === HazardKind.Crusher ||
        hz.kind === HazardKind.Spikeball
          ? pt.x >= Math.min(prev?.x ?? ht.x, ht.x, pos?.x ?? ht.x) - reach &&
            pt.x <= Math.max(prev?.x ?? ht.x, ht.x, pos?.x ?? ht.x) + reach &&
            pt.y >= Math.min(prev?.y ?? ht.y, ht.y, pos?.y ?? ht.y) - 1.6 &&
            pt.y <= Math.max(prev?.y ?? ht.y, ht.y, pos?.y ?? ht.y) + 1.6
          : false;
      // Static kill beds: last-tick player skip must still invoke contact.
      const playerSweep =
        hz.kind === HazardKind.Spikes
          ? ht.x >= Math.min(pprev?.x ?? pt.x, pt.x) - reach &&
            ht.x <= Math.max(pprev?.x ?? pt.x, pt.x) + reach &&
            ht.y >= Math.min(pprev?.y ?? pt.y, pt.y) - 1.6 &&
            ht.y <= Math.max(pprev?.y ?? pt.y, pt.y) + 1.6
          : false;
      const near = sweep || playerSweep || (dx < reach && dy < 1.6);
      const mod = moduleForKind(hz.kind);
      if (!mod?.contact) return;
      if (!near && hz.kind !== HazardKind.Laser && hz.kind !== HazardKind.Conveyor) return;
      mod.contact(world, player, hz, ht, ctrl, dt, hazard);
    });
  });

  world.query(Destructible, Transform).updateEach(([d, t], entity) => {
    if (d.hp > 0) return;
    const hz = entity.get(Hazard);
    if (hz?.kind === HazardKind.Barrel) {
      emit(world, { type: 'explosion', x: t.x, y: t.y, radius: 2.4, damage: 35 });
      applyExplosion(world, t.x, t.y, 2.4, 10, (body, falloff) => {
        const data = body.getUserData() as FixtureUserData | undefined;
        const target = data?.entity as Entity | undefined;
        if (!target || !world.has(target) || !target.has(Player) || target.has(Dead)) return;
        takeDamage(world, target, 10 + 45 * falloff, 'body', -1, t.x, t.y);
      });
      // PLAN 2.5 / 4.14: Western barrels spawn snakes.
      if (ctx.level.theme === 'western') {
        spawnSnake(world, t.x - 0.2, t.y + 0.2, undefined, false, false);
        spawnSnake(world, t.x + 0.2, t.y + 0.2, undefined, false, false);
      }
    }
    if (hz?.kind === HazardKind.Destructible) {
      spawnDestructibleDebris(world, t.x, t.y);
    }
    ctx.pendingDestroy.push(entity);
  });
}

/** PLAN Appendix D: broken destructibles become short-lived dynamic chunks + particles. */
function spawnDestructibleDebris(world: World, x: number, y: number): void {
  const ctx = getContext(world);
  emit(world, { type: 'explosion', x, y, radius: 0.8, damage: 0 });
  for (let i = 0; i < 4; i++) {
    const ox = (i - 1.5) * 0.18;
    const chunk = world.spawn(
      Transform({ x: x + ox, y: y, angle: 0 }),
      PrevTransform({ x: x + ox, y: y, angle: 0 }),
      Hazard({
        kind: HazardKind.Debris,
        param0: 0.24,
        param1: 0.24,
        param2: 0,
        param3: 0,
        hp: 0,
        armed: 1,
      }),
      Lifetime({ ticksLeft: 50 }),
    );
    assignNetId(world, chunk);
    const body = createBoxBody(ctx.physics, chunk, 'prop', x + ox, y, 0.12, 0.12, 'dynamic', {
      density: 0.35,
      friction: 0.4,
      restitution: 0.15,
      fixedRotation: false,
    });
    body.setLinearVelocity({ x: (i - 1.5) * 3.2, y: 3.5 + i * 0.4 });
    registerBody(world, chunk, body);
  }
}
