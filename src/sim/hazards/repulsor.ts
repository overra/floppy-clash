import type { Entity, World } from 'koota';
import { emit, getContext } from '../context';
import { createCircleBody, registerBody } from '../physics/bodies';
import { takeDamage } from '../player/health';
import { launchHit } from '../player/knockback';
import { HazardKind, Lifetime, Solid, Static, Transform } from '../traits';
import { spawnHazardEntity } from './common';
import type { HazardModule } from './types';

/** How long a planted puck stays, how hard it bats, the sting it leaves, and the pause between bats. */
export const REPULSOR_TICKS = 480;
const REPULSOR_RADIUS = 0.45;
const REPULSOR_KNOCKBACK = 12;
const REPULSOR_LIFT = 3;
const REPULSOR_DAMAGE = 4;
const REPULSOR_COOLDOWN_TICKS = 8;

/**
 * A planted bumper. param0 = radius, param1 = shove speed, param2 = tick of the last bat (so one
 * fighter is not machine-gunned off it). Anyone whose centre comes within reach is shoved straight
 * away from it, with a sting of damage so the hit registers everywhere a hit should.
 */
export const repulsor: HazardModule = {
  typeId: 'repulsor',
  kind: HazardKind.Repulsor,
  create: (world, obj) => {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.Repulsor);
    entity.add(Static(), Solid());
    const body = createCircleBody(ctx.physics, entity, 'sensor', obj.x, obj.y, obj.r ?? REPULSOR_RADIUS, 'static', { sensor: true });
    registerBody(world, entity, body);
    return entity;
  },
  contact(world, player, hz, ht, _ctrl, _dt, hazard) {
    const ctx = getContext(world);
    const pt = player.get(Transform);
    if (!pt) return;
    const reach = (hz.param0 || REPULSOR_RADIUS) + ctx.tuning.radius + 0.15;
    const dx = pt.x - ht.x;
    const dy = pt.y - ht.y;
    if (dx * dx + dy * dy > reach * reach) return;
    if (ctx.tick - hz.param2 < REPULSOR_COOLDOWN_TICKS) return;
    hz.param2 = ctx.tick;
    const len = Math.hypot(dx, dy);
    const ux = len > 1e-3 ? dx / len : 0;
    const uy = len > 1e-3 ? dy / len : 1;
    takeDamage(world, player, REPULSOR_DAMAGE, 'body', -1, pt.x, pt.y);
    launchHit(world, player, ux, uy, hz.param1 || REPULSOR_KNOCKBACK, REPULSOR_LIFT);
    emit(world, { type: 'clash', x: ht.x + ux * (hz.param0 || REPULSOR_RADIUS), y: ht.y + uy * (hz.param0 || REPULSOR_RADIUS) });
    void hazard;
  },
};

/** Plant a puck at (x, y) that fades after REPULSOR_TICKS. */
export function plantRepulsor(world: World, x: number, y: number): Entity | undefined {
  const entity = repulsor.create(world, { type: 'repulsor', x, y, r: REPULSOR_RADIUS, speed: REPULSOR_KNOCKBACK });
  entity?.add(Lifetime({ ticksLeft: REPULSOR_TICKS }));
  return entity;
}
