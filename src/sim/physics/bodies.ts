import type { Entity } from 'koota';
import { Box, Circle, type Body, type World as PhysicsWorld } from 'planck';
import { Category, Mask, type BodyKind, type FixtureUserData } from './categories';
import { getContext } from '../context';
import { NetId, PhysBody, Transform, PrevTransform } from '../traits';
import type { World } from 'koota';

export function registerBody(world: World, entity: Entity, body: Body): void {
  const ctx = getContext(world);
  ctx.bodies.set(entity, body);
  ctx.entityOf.set(body, entity);
  entity.add(PhysBody({ body }));
  // syncTransforms only writes entities that have PrevTransform. Weapons, snakes,
  // chain links and other props must interpolate and pick up from the live body.
  const t = entity.get(Transform);
  if (t && !entity.get(PrevTransform)) {
    entity.add(PrevTransform({ x: t.x, y: t.y, angle: t.angle }));
  }
}

export function destroyBody(world: World, entity: Entity): void {
  const ctx = getContext(world);
  const body = ctx.bodies.get(entity);
  if (body) {
    ctx.physics.destroyBody(body);
    ctx.bodies.delete(entity);
  }
}

export function filterFor(kind: BodyKind): { categoryBits: number; maskBits: number } {
  switch (kind) {
    case 'player':
      return { categoryBits: Category.Player, maskBits: Mask.Player };
    case 'ragdoll':
      return { categoryBits: Category.Ragdoll, maskBits: Mask.Ragdoll };
    case 'weapon':
      return { categoryBits: Category.Weapon, maskBits: Mask.Weapon };
    case 'projectile':
      return { categoryBits: Category.Projectile, maskBits: Mask.Projectile };
    case 'prop':
      return { categoryBits: Category.Prop, maskBits: Mask.Prop };
    case 'sensor':
      return { categoryBits: Category.Sensor, maskBits: Mask.Sensor };
    default:
      return { categoryBits: Category.Static, maskBits: Mask.Static };
  }
}

export function createBoxBody(
  physics: PhysicsWorld,
  entity: Entity,
  kind: BodyKind,
  x: number,
  y: number,
  hx: number,
  hy: number,
  type: 'static' | 'dynamic' | 'kinematic',
  extras?: { density?: number; friction?: number; restitution?: number; sensor?: boolean; angle?: number; fixedRotation?: boolean; bullet?: boolean },
): Body {
  const filter = filterFor(kind);
  const body = physics.createBody({
    type,
    position: { x, y },
    angle: extras?.angle ?? 0,
    fixedRotation: extras?.fixedRotation ?? type !== 'dynamic',
    bullet: extras?.bullet ?? false,
    allowSleep: type === 'static',
  });
  const userData: FixtureUserData = { entity, kind, sensor: extras?.sensor ? 'main' : undefined };
  body.createFixture({
    shape: new Box(hx, hy),
    density: extras?.density ?? (type === 'dynamic' ? 1 : 0),
    friction: extras?.friction ?? 0.4,
    restitution: extras?.restitution ?? 0,
    isSensor: extras?.sensor ?? false,
    filterCategoryBits: filter.categoryBits,
    filterMaskBits: filter.maskBits,
    userData,
  });
  body.setUserData(userData);
  return body;
}

export function createCircleBody(
  physics: PhysicsWorld,
  entity: Entity,
  kind: BodyKind,
  x: number,
  y: number,
  radius: number,
  type: 'static' | 'dynamic' | 'kinematic',
  extras?: { density?: number; friction?: number; restitution?: number; sensor?: boolean; bullet?: boolean },
): Body {
  const filter = filterFor(kind);
  const body = physics.createBody({
    type,
    position: { x, y },
    bullet: extras?.bullet ?? false,
  });
  const userData: FixtureUserData = { entity, kind };
  body.createFixture({
    shape: new Circle(radius),
    density: extras?.density ?? (type === 'dynamic' ? 1 : 0),
    friction: extras?.friction ?? 0.3,
    restitution: extras?.restitution ?? 0,
    isSensor: extras?.sensor ?? false,
    filterCategoryBits: filter.categoryBits,
    filterMaskBits: filter.maskBits,
    userData,
  });
  body.setUserData(userData);
  return body;
}

export function createPlayerCapsule(
  world: World,
  entity: Entity,
  x: number,
  y: number,
): Body {
  const ctx = getContext(world);
  const { radius, height } = ctx.tuning;
  const filter = filterFor('player');
  const body = ctx.physics.createBody({
    type: 'dynamic',
    position: { x, y },
    fixedRotation: true,
    allowSleep: false,
    bullet: true,
  });
  const hx = radius;
  const hy = height / 2;
  const userData: FixtureUserData = { entity, kind: 'player' };
  body.createFixture({
    shape: new Box(hx, hy - radius * 0.35),
    density: 1.2,
    friction: 0,
    restitution: 0,
    filterCategoryBits: filter.categoryBits,
    filterMaskBits: filter.maskBits,
    userData,
  });
  body.createFixture({
    shape: new Circle(radius),
    density: 0.4,
    friction: 0,
    filterCategoryBits: filter.categoryBits,
    filterMaskBits: filter.maskBits,
    userData: { entity, kind: 'player', sensor: 'torso' },
  });
  body.createFixture({
    shape: new Box(hx * 0.7, 0.08, { x: 0, y: -hy + 0.05 }),
    isSensor: true,
    density: 0,
    filterCategoryBits: Category.Sensor,
    filterMaskBits: Category.Static | Category.Prop | Category.Player | Category.Ragdoll | Category.Weapon,
    userData: { entity, kind: 'player', sensor: 'ground' },
  });
  body.setUserData(userData);
  registerBody(world, entity, body);
  if (!entity.get(Transform)) entity.add(Transform({ x, y, angle: 0 }));
  else entity.set(Transform, { x, y, angle: 0 });
  if (!entity.get(PrevTransform)) entity.add(PrevTransform({ x, y, angle: 0 }));
  else entity.set(PrevTransform, { x, y, angle: 0 });
  return body;
}

export function assignNetId(world: World, entity: Entity): number {
  const ctx = getContext(world);
  const id = ctx.ids.alloc();
  entity.add(NetId({ id }));
  return id;
}
