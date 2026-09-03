import type { Entity, World } from 'koota';
import { getContext } from '../context';
import { assignNetId, createBoxBody, createCircleBody, registerBody } from '../physics/bodies';
import { takeDamage } from '../player/health';
import { Vec2 } from 'planck';
import {
  Destructible,
  Hazard,
  Kinematic,
  PrevTransform,
  Solid,
  StandingOn,
  Static,
  Transform,
} from '../traits';
import { weaponIndex } from '../weapons/defs';
import type { LevelObject } from '../level/schema';
import type { ControllerView, TransformView } from './types';

export const lavaTouch = new Map<number, number>();

export function paramsFromObject(obj: LevelObject): {
  param0: number;
  param1: number;
  param2: number;
  param3: number;
} {
  switch (obj.type) {
    case 'trigger.drop':
      return {
        param0: obj.atTick ?? 180,
        param1: weaponIndex(obj.weapon ?? 'pistol'),
        param2: 0,
        param3: 0,
      };
    case 'lava':
      return { param0: obj.rate ?? 0, param1: obj.w ?? 4, param2: obj.h ?? 1.2, param3: 0 };
    case 'laser':
      return {
        param0: obj.onTicks ?? 40,
        param1: obj.offTicks ?? 50,
        param2: obj.warningTicks ?? 12,
        param3: 14,
      };
    case 'conveyor':
      return { param0: obj.w ?? 6, param1: obj.speed ?? 4, param2: 0, param3: 0 };
    case 'bounce':
      return { param0: obj.w ?? 2, param1: obj.speed ?? 16, param2: 0, param3: 0 };
    case 'saw':
      return { param0: obj.omega ?? 6, param1: obj.speed ?? 0, param2: 0, param3: 0 };
    case 'crusher':
      return { param0: obj.period ?? 60, param1: obj.speed ?? 4, param2: 0, param3: 0 };
    case 'platform.disappearing':
      return { param0: obj.period ?? 140, param1: obj.delay ?? 0, param2: 0, param3: 0 };
    case 'platform.collapsing':
      return { param0: obj.w ?? 3, param1: 0, param2: obj.delay ?? 20, param3: 0 };
    case 'platform.rotating':
      return { param0: obj.omega ?? 1, param1: 0, param2: 0, param3: 0 };
    case 'platform.moving':
      return {
        param0: obj.speed ?? 3,
        param1: obj.path?.length ?? 2,
        param2: obj.mode === 'loop' ? 0 : 1,
        param3: 0,
      };
    default:
      return {
        param0: obj.speed ?? obj.period ?? obj.w ?? 0,
        param1: obj.path?.length ?? obj.rate ?? obj.offTicks ?? obj.h ?? 0,
        param2: obj.mode === 'pingpong' ? 1 : (obj.delay ?? obj.warningTicks ?? 0),
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
  const body = createBoxBody(
    ctx.physics,
    entity,
    opts.sensor ? 'sensor' : 'solid',
    obj.x,
    obj.y,
    w,
    h,
    'static',
    {
      friction: opts.friction ?? 0.6,
      restitution: opts.restitution ?? 0,
      sensor: opts.sensor,
    },
  );
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
  if (opts.destructible != null)
    entity.add(Destructible({ hp: opts.destructible, maxHp: opts.destructible }));
  return entity;
}

export function createKinematicBox(
  world: World,
  obj: LevelObject,
  kind: number,
  opts: {
    dynamic?: boolean;
    density?: number;
    friction?: number;
    sensor?: boolean;
    tag?: boolean;
  } = {},
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
  const body = createCircleBody(
    ctx.physics,
    entity,
    'sensor',
    obj.x,
    obj.y,
    obj.r ?? 0.45,
    'kinematic',
    {
      sensor: true,
    },
  );
  registerBody(world, entity, body);
  entity.add(Kinematic());
  return entity;
}

export function kill(world: World, player: Entity, x: number, y: number): void {
  takeDamage(world, player, 9999, 'body', -1, x, y, true);
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

export function carryRider(
  world: World,
  player: Entity,
  hazard: Entity,
  pt: TransformView,
  ht: TransformView,
  ctrl: ControllerView,
  dt: number,
): void {
  const dx = Math.abs(pt.x - ht.x);
  if (!ctrl.grounded || dx >= 2.4 || pt.y <= ht.y || pt.y >= ht.y + 1.4) return;
  player.add(StandingOn(hazard));
  const ctx = getContext(world);
  const pb = ctx.bodies.get(hazard);
  const body = ctx.bodies.get(player);
  if (pb && body) {
    const pv = pb.getLinearVelocity();
    const v = body.getLinearVelocity();
    body.setLinearVelocity(new Vec2(v.x + pv.x * dt * 10, v.y + pv.y));
  }
}
