import type { Entity, World } from 'koota';
import { getContext } from '../context';
import { assignNetId, createBoxBody, createCircleBody, registerBody } from '../physics/bodies';
import { takeDamage } from '../player/health';
import { Vec2 } from 'planck';
import { Anchor, Destructible, Hazard, Kinematic, PrevTransform, Solid, StandingOn, Static, Transform } from '../traits';
import { weaponIndex } from '../weapons/defs';
import type { LevelObject } from '../level/schema';
import type { ControllerView, TransformView } from './types';

export const lavaTouch = new Map<number, number>();

type HazardParams = { param0: number; param1: number; param2: number; param3: number };

/** Half-extent of a two-point `path`, or a default sweep when only `speed` is authored. */
function pathAmplitude(obj: LevelObject, fallback: number): { ax: number; ay: number } {
  const a = obj.path?.[0];
  const b = obj.path?.[1];
  if (a && b) return { ax: Math.abs(b.x - a.x) / 2, ay: Math.abs(b.y - a.y) / 2 };
  return { ax: fallback, ay: 0 };
}

/**
 * Authored fields → the four numeric hazard params. Each type owns its own slots; the meaning
 * is documented on the module that consumes them.
 */
export function paramsFromObject(obj: LevelObject): HazardParams {
  const w = obj.w ?? 2;
  const h = obj.h ?? 1;
  switch (obj.type) {
    case 'trigger.drop':
      return { param0: obj.atTick ?? 180, param1: weaponIndex(obj.weapon ?? 'pistol'), param2: 0, param3: 0 };
    case 'spikes':
      return { param0: w, param1: 0, param2: 0, param3: 0 };
    case 'lava':
      // rise rate (m/s), half-width reach
      return { param0: obj.rate ?? 0, param1: w / 2, param2: 0, param3: 0 };
    case 'laser':
      // unarmed ticks, armed ticks, phase offset, beam reach
      return { param0: obj.offTicks ?? 90, param1: obj.onTicks ?? 40, param2: obj.delay ?? 0, param3: obj.w ?? 14 };
    case 'platform.moving': {
      // sweep half-extents, linear speed, running phase
      const amp = pathAmplitude(obj, 3.5);
      return { param0: amp.ax, param1: amp.ay, param2: obj.speed ?? 3, param3: 0 };
    }
    case 'saw': {
      // spin (rad/s), sweep half-extent, linear speed, running phase
      const amp = pathAmplitude(obj, 0);
      return { param0: obj.omega ?? 7, param1: amp.ax, param2: obj.speed ?? 2.5, param3: 0 };
    }
    case 'crusher':
      // cycle period (ticks), drop distance (m), phase offset
      return { param0: obj.period ?? 150, param1: obj.speed ?? 3, param2: obj.delay ?? 0, param3: 0 };
    case 'platform.rotating':
      return { param0: obj.omega ?? 1, param1: 0, param2: 0, param3: 0 };
    case 'platform.disappearing':
      // period, phase offset
      return { param0: obj.period ?? 180, param1: obj.delay ?? 0, param2: 0, param3: 0 };
    case 'platform.collapsing':
      // stand half-width, stood counter, ticks before it lets go
      return { param0: w / 2 + 0.3, param1: 0, param2: obj.delay ?? 30, param3: 0 };
    case 'conveyor':
      // half-width, belt speed (sign = direction)
      return { param0: w / 2, param1: obj.speed ?? 4, param2: 0, param3: 0 };
    case 'bounce':
      // half-width, launch speed
      return { param0: w / 2, param1: obj.speed ?? 18, param2: 0, param3: 0 };
    case 'repulsor':
      // radius, shove speed, tick of the last shove
      return { param0: obj.r ?? 0.45, param1: obj.speed ?? 12, param2: -999, param3: 0 };
    case 'surge.orb':
      // drift phase (ticks), drift speed
      return { param0: obj.delay ?? 0, param1: obj.speed ?? 0.5, param2: 0, param3: 0 };
    default:
      return {
        param0: obj.speed ?? obj.period ?? w,
        param1: obj.rate ?? obj.offTicks ?? h,
        param2: obj.delay ?? obj.warningTicks ?? 0,
        param3: obj.onTicks ?? obj.omega ?? 0,
      };
  }
}

export function spawnHazardEntity(world: World, obj: LevelObject, kind: number): Entity {
  const p = paramsFromObject(obj);
  const entity = world.spawn(
    Transform({ x: obj.x, y: obj.y, angle: obj.angle ?? 0 }),
    PrevTransform({ x: obj.x, y: obj.y, angle: obj.angle ?? 0 }),
    Hazard({
      kind,
      param0: p.param0,
      param1: p.param1,
      param2: p.param2,
      param3: p.param3,
      hp: obj.hp ?? 0,
      armed: 1,
    }),
  );
  assignNetId(world, entity);
  return entity;
}

export function createStaticBox(
  world: World,
  obj: LevelObject,
  kind: number,
  opts: { friction?: number; restitution?: number; sensor?: boolean } = {},
): Entity {
  const ctx = getContext(world);
  const entity = spawnHazardEntity(world, obj, kind);
  entity.add(Static(), Solid());
  const w = (obj.w ?? 2) / 2;
  const h = (obj.h ?? 1) / 2;
  const body = createBoxBody(ctx.physics, entity, opts.sensor ? 'sensor' : 'solid', obj.x, obj.y, w, h, 'static', {
    friction: opts.friction ?? 0.6,
    restitution: opts.restitution ?? 0,
    sensor: opts.sensor,
  });
  registerBody(world, entity, body);
  return entity;
}

export function createDynamicBox(
  world: World,
  obj: LevelObject,
  kind: number,
  opts: { density?: number; friction?: number; destructible?: number } = {},
): Entity {
  const ctx = getContext(world);
  const entity = spawnHazardEntity(world, obj, kind);
  const w = (obj.w ?? 2) / 2;
  const h = (obj.h ?? 1) / 2;
  const body = createBoxBody(ctx.physics, entity, 'prop', obj.x, obj.y, w, h, 'dynamic', {
    density: opts.density ?? 0.5,
    friction: opts.friction ?? 0.5,
    fixedRotation: false,
  });
  registerBody(world, entity, body);
  if (opts.destructible != null) entity.add(Destructible({ hp: opts.destructible, maxHp: opts.destructible }));
  return entity;
}

export function createKinematicBox(
  world: World,
  obj: LevelObject,
  kind: number,
  opts: { dynamic?: boolean; density?: number; friction?: number; sensor?: boolean; tag?: boolean } = {},
): Entity {
  const ctx = getContext(world);
  const entity = spawnHazardEntity(world, obj, kind);
  const w = (obj.w ?? 2) / 2;
  const h = (obj.h ?? 1) / 2;
  const body = createBoxBody(
    ctx.physics,
    entity,
    opts.sensor ? 'sensor' : 'solid',
    obj.x,
    obj.y,
    w,
    h,
    opts.dynamic ? 'dynamic' : 'kinematic',
    { friction: opts.friction ?? 0.8, density: opts.density ?? 0, sensor: opts.sensor },
  );
  registerBody(world, entity, body);
  if (opts.tag !== false) entity.add(Kinematic());
  return entity;
}

export function createKinematicCircle(world: World, obj: LevelObject, kind: number): Entity {
  const ctx = getContext(world);
  const entity = spawnHazardEntity(world, obj, kind);
  const body = createCircleBody(ctx.physics, entity, 'sensor', obj.x, obj.y, obj.r ?? 0.45, 'kinematic', {
    sensor: true,
  });
  registerBody(world, entity, body);
  entity.add(Kinematic());
  return entity;
}

/** Drive a kinematic body toward `target` over one tick (exact arrival, so riders get the real velocity). */
export function steerTo(world: World, entity: Entity, tx: number, ty: number): void {
  const ctx = getContext(world);
  const body = ctx.bodies.get(entity);
  if (!body) return;
  const dt = 1 / ctx.tuning.tickRate;
  const p = body.getPosition();
  body.setLinearVelocity(new Vec2((tx - p.x) / dt, (ty - p.y) / dt));
}

export function anchorOf(entity: Entity, fallback: { x: number; y: number }): { x: number; y: number } {
  if (!entity.has(Anchor)) entity.add(Anchor({ x: fallback.x, y: fallback.y }));
  return entity.get(Anchor) ?? fallback;
}

export function kill(world: World, player: Entity, x: number, y: number): void {
  takeDamage(world, player, 9999, 'body', -1, x, y, true);
}

/** Hurt a breakable prop and remember whose blow it was (a broken Surge Orb goes to them). */
export function woundDestructible(target: Entity, amount: number, by: Entity | number | undefined): void {
  const d = target.get(Destructible);
  if (!d) return;
  const lastHit = typeof by === 'number' && by >= 0 ? by : d.lastHit;
  target.set(Destructible, { hp: d.hp - amount, maxHp: d.maxHp, lastHit });
}

export function nearKill(
  world: World,
  player: Entity,
  pt: TransformView,
  ht: TransformView,
  reach = 0.7,
): void {
  const dx = Math.abs(pt.x - ht.x);
  const dy = Math.abs(pt.y - ht.y);
  if (dx < reach && dy < reach) kill(world, player, pt.x, pt.y);
}

/**
 * Tag a rider. The controller does the actual carrying (it reads the ground body's velocity from
 * the foot raycast), so this only records the relation for gameplay/rendering.
 */
export function carryRider(
  _world: World,
  player: Entity,
  hazard: Entity,
  pt: TransformView,
  ht: TransformView,
  ctrl: ControllerView,
  _dt: number,
): void {
  const dx = Math.abs(pt.x - ht.x);
  if (!ctrl.grounded || dx >= 2.4 || pt.y <= ht.y || pt.y >= ht.y + 1.4) return;
  player.add(StandingOn(hazard));
}
