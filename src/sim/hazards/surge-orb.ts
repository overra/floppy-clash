import type { Entity, World } from 'koota';
import { emit, getContext } from '../context';
import { createCircleBody, registerBody } from '../physics/bodies';
import { NO_EFFECT } from '../weapons/consumables';
import { spawnWeapon } from '../weapons/systems';
import { disarm } from '../player/combat';
import { Dead, Destructible, EffectKind, HazardKind, Held, HeldBy, Kinematic, Loose, Modifiers, Player, Transform } from '../traits';
import { anchorOf, spawnHazardEntity, steerTo } from './common';
import type { HazardModule } from './types';

export const SURGE_ORB_HP = 40;
const SURGE_ORB_RADIUS = 0.4;
/** How long the winner's aura lasts if they sit on the shot. */
const SURGE_AURA_TICKS = 900;

/**
 * A Surge Orb drifts in a lazy loop above the arena until someone breaks it; the one whose blow
 * finished it gets the Surge Cannon in hand (whatever they held drops) and a white aura until they
 * fire. param0 = drift phase, param1 = drift speed.
 */
export const surgeOrb: HazardModule = {
  typeId: 'surge.orb',
  kind: HazardKind.SurgeOrb,
  create: (world, obj) => {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.SurgeOrb);
    entity.add(Kinematic(), Destructible({ hp: obj.hp ?? SURGE_ORB_HP, maxHp: obj.hp ?? SURGE_ORB_HP, lastHit: -1 }));
    const body = createCircleBody(ctx.physics, entity, 'prop', obj.x, obj.y, obj.r ?? SURGE_ORB_RADIUS, 'kinematic', { friction: 0.2 });
    registerBody(world, entity, body);
    return entity;
  },
  step(world, entity, hz, tr) {
    const ctx = getContext(world);
    const home = anchorOf(entity, { x: tr.x, y: tr.y });
    // Speed 0 is an authored orb that hangs where it was placed.
    if (hz.param1 === 0) return;
    const t = (ctx.tick + hz.param0) / ctx.tuning.tickRate;
    const speed = hz.param1;
    // A figure-eight that stays inside the arena's upper half.
    const { bounds } = ctx.level;
    const tx = Math.min(bounds.x + bounds.w - 1.5, Math.max(bounds.x + 1.5, home.x + Math.sin(t * speed) * 4));
    const ty = Math.min(bounds.y + bounds.h - 1.5, Math.max(bounds.y + bounds.h * 0.45, home.y + Math.sin(t * speed * 2) * 1.2));
    steerTo(world, entity, tx, ty);
  },
};

/** Drop an orb into the arena at (x, y), drifting from there. */
export function spawnSurgeOrb(world: World, x: number, y: number): Entity | undefined {
  const ctx = getContext(world);
  return surgeOrb.create(world, { type: 'surge.orb', x, y, r: SURGE_ORB_RADIUS, speed: 0.5, delay: ctx.rng.nextInt(600) });
}

/** The orb broke: hand the super to whoever landed the last blow (if they are still standing). */
export function grantSurge(world: World, orb: Entity): void {
  const ctx = getContext(world);
  const d = orb.get(Destructible);
  const at = orb.get(Transform);
  if (!d || !at) return;
  const winner = ctx.players.find((p) => (p as unknown as number) === d.lastHit && world.has(p) && p.has(Player) && !p.has(Dead));
  emit(world, { type: 'explosion', x: at.x, y: at.y, radius: 1.2, damage: 0 });
  if (!winner) return;
  const wt = winner.get(Transform);
  if (!wt) return;
  // Whatever they were holding is dropped; the cannon takes its place.
  disarm(world, winner);
  const cannon = spawnWeapon(world, 'surge-cannon', wt.x, wt.y, false);
  cannon.remove(Loose);
  cannon.add(Held(), HeldBy(winner));
  ctx.bodies.get(cannon)?.setActive(false);
  if (winner.get(Modifiers)) winner.set(Modifiers, { ...NO_EFFECT, kind: EffectKind.Surge, ticks: SURGE_AURA_TICKS });
  emit(world, { type: 'pickup', player: winner, weaponId: 'surge-cannon' });
}
