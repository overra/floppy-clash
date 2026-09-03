import { createQuery, Not, type Entity, type ExtractSchema, type TraitRecord, type World } from 'koota';
import { Vec2 } from 'planck';
import { emit, getContext, type SimContext } from '../context';
import { applyExplosion, queryBodiesInRadius, raycastClosest } from '../physics/queries';
import { takeDamage, hitZoneAt } from '../player/health';
import { shieldBlocks } from '../player/combat';
import { assignNetId, createBoxBody, registerBody } from '../physics/bodies';
import {
  Aim,
  Controller,
  Dead,
  Destructible,
  Health,
  Loose,
  OwnedBy,
  Player,
  PrevTransform,
  Projectile,
  ProjectileKind,
  Snake,
  Status,
  Transform,
  Weapon,
} from '../traits';
import { weaponByIndex } from './defs';
import type { WeaponDef } from './schema';
import type { FixtureUserData } from '../physics/categories';

const bullets = createQuery(Projectile);
const livePlayers = createQuery(Player, Transform, Not(Dead));

/** Ticks a melee swing stays active; spawnBullet seeds the projectile fuse with this. */
export const SWING_TICKS = 8;
/** How far the blade reaches past the fighter's centre, on top of the def radius. */
const SWING_BASE_REACH = 0.35;
const SWING_HALF_ANGLE_COS = Math.cos((60 * Math.PI) / 180);
/** Anchored fields: ticks of flight before they open on their own, then how long they hold. */
const HOLE_FLIGHT_TICKS = 36;
const HOLE_HOLD_TICKS = 180;
const HOLE_KILL_RADIUS = 0.7;
/** The shooter gets this long to get clear once their own hole opens. */
const HOLE_OWNER_GRACE_TICKS = 45;
const BUBBLE_FLIGHT_TICKS = 40;
const BUBBLE_HOLD_TICKS = 240;
const BURN_TICKS = 150;
const GLUE_TICKS = 120;
const SNAKE_GRACE_TICKS = 90;

type Swing = { owner: Entity; ox: number; oy: number; tx: number; ty: number };
type ProjectileState = TraitRecord<ExtractSchema<typeof Projectile>>;

function ownerOf(entity: Entity): Entity | undefined {
  return entity.targetFor(OwnedBy);
}

function applyStatus(target: Entity, status: string, ticks: number): void {
  const current = target.get(Status) ?? { burning: 0, slowed: 0, glued: 0, bubbled: 0 };
  if (status === 'burn') current.burning = Math.max(current.burning, ticks);
  if (status === 'slow') current.slowed = Math.max(current.slowed, ticks);
  if (status === 'glue') current.glued = Math.max(current.glued, ticks);
  if (status === 'bubble') current.bubbled = Math.max(current.bubbled, ticks);
  if (target.get(Status)) target.set(Status, current);
  else target.add(Status(current));
}

function shove(ctx: SimContext, target: Entity, dirX: number, dirY: number, amount: number, lift = 0): void {
  const tb = ctx.bodies.get(target);
  if (!tb) return;
  const v = tb.getLinearVelocity();
  const len = Math.hypot(dirX, dirY) || 1;
  tb.setLinearVelocity(new Vec2(v.x + (dirX / len) * amount, v.y + (dirY / len) * amount + lift));
}

/**
 * A blast at (x, y): hurts and shoves fighters with falloff, wounds snakes and destructibles (so
 * barrels chain), and emits the explosion event for FX. Shared by shells, rockets and barrels.
 */
export function detonate(world: World, x: number, y: number, radius: number, damage: number, impulse: number, owner?: Entity, status = 'none'): void {
  emit(world, { type: 'explosion', x, y, radius, damage });
  applyExplosion(world, x, y, radius, impulse, (body, falloff) => {
    const data = body.getUserData() as FixtureUserData | undefined;
    if (!data) return;
    const target = data.entity as Entity;
    if (!world.has(target)) return;
    if (target.has(Player) && !target.has(Dead)) {
      takeDamage(world, target, damage * falloff, 'body', owner ?? -1, x, y);
      if (status !== 'none') applyStatus(target, status, Math.round(BURN_TICKS * Math.max(0.4, falloff)));
    }
    if (target.has(Snake)) {
      const h = target.get(Health);
      if (h) target.set(Health, { hp: h.hp - damage * falloff, maxHp: h.maxHp });
    }
    if (target.has(Destructible)) {
      const d = target.get(Destructible);
      if (d) {
        const hp = d.hp - damage * falloff;
        target.set(Destructible, { hp, maxHp: d.maxHp });
      }
    }
  });
}

function explode(world: World, x: number, y: number, defId: number, owner?: Entity): void {
  const def = weaponByIndex(defId);
  const radius = def.projectile.radius || 2;
  const damage = def.projectile.explodeDamage || def.projectile.damage;
  detonate(world, x, y, radius, damage, def.projectile.explodeImpulse || 8, owner, def.projectile.status);
}

function burst(world: World, proj: { x: number; y: number }, def: WeaponDef, owner: Entity | undefined): void {
  const kind = def.projectile.burstInto === 'snake' ? 'snake' : 'spike';
  const count = def.projectile.burstCount ?? 4;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    if (kind === 'snake') spawnSnake(world, proj.x, proj.y, owner, false, false, Math.cos(a) * 5, Math.abs(Math.sin(a)) * 6 + 2);
    else spawnBulletLike(world, proj.x, proj.y, Math.cos(a) * 18, Math.sin(a) * 18, 10, owner);
  }
}

function spawnSnake(world: World, x: number, y: number, owner: Entity | undefined, giant: boolean, flying: boolean, vx = 0, vy = 0): void {
  const ctx = getContext(world);
  const hp = (ctx.settings.maxHp || 100) * (giant ? 2 : 1);
  const snake = world.spawn(
    Snake({ hp, giant: giant ? 1 : 0, flying: flying ? 1 : 0, biteCooldown: 0, grace: SNAKE_GRACE_TICKS }),
    Health({ hp, maxHp: hp }),
    Transform({ x, y, angle: 0 }),
    PrevTransform({ x, y, angle: 0 }),
  );
  if (owner) snake.add(OwnedBy(owner));
  assignNetId(world, snake);
  const body = createBoxBody(ctx.physics, snake, 'projectile', x, y, giant ? 0.35 : 0.18, giant ? 0.18 : 0.1, 'dynamic', {
    density: 0.5,
    friction: 0.3,
    fixedRotation: true,
  });
  body.setLinearVelocity(new Vec2(vx, vy));
  if (flying) body.setGravityScale(0);
  registerBody(world, snake, body);
}

function playerCentre(ctx: SimContext, entity: Entity, fallback: { x: number; y: number }): { x: number; y: number } {
  const b = ctx.bodies.get(entity);
  if (!b) return { x: fallback.x, y: fallback.y };
  const p = b.getPosition();
  return { x: p.x, y: p.y };
}

/** Distance from point P to segment AB. */
function segmentDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * A swing is a short-lived hitbox that follows the wielder: a blade-length segment along the aim that
 * lands once per target, breaks props, and parries bullets crossing it.
 */
function stepSwing(world: World, ctx: SimContext, entity: Entity, proj: ProjectileState, def: WeaponDef, owner: Entity | undefined): void {
  const ot = owner?.get(Transform);
  const aim = owner?.get(Aim);
  if (!owner || !ot || !aim || owner.has(Dead)) {
    ctx.pendingDestroy.push(entity);
    return;
  }
  const reach = SWING_BASE_REACH + def.projectile.radius;
  const tipX = ot.x + aim.x * reach;
  const tipY = ot.y + aim.y * reach;
  proj.x = tipX;
  proj.y = tipY;
  proj.vx = aim.x * (def.projectile.speed || 1);
  proj.vy = aim.y * (def.projectile.speed || 1);

  world.query(livePlayers).updateEach(([player, pt], other) => {
    if (other === owner) return;
    const bit = 1 << player.slot;
    if (proj.hitMask & bit) return;
    const c = playerCentre(ctx, other, pt);
    const dx = c.x - ot.x;
    const dy = c.y - ot.y;
    const dist = Math.hypot(dx, dy);
    if (dist > reach + 0.45) return;
    const cos = (dx * aim.x + dy * aim.y) / (dist || 1);
    if (dist > 0.6 && cos < SWING_HALF_ANGLE_COS) return;
    proj.hitMask |= bit;
    // Judge the guard against where the swing comes from: the blade tip may already be past the target.
    const block = shieldBlocks(world, other, ot.x, ot.y);
    if (block !== 'none') {
      emit(world, { type: 'block', player: other, reflected: false, x: c.x, y: c.y });
      shove(ctx, other, aim.x, aim.y, def.knockback * 0.5);
      // A parried lunge stops the attacker cold.
      const ob = ctx.bodies.get(owner);
      if (ob) ob.setLinearVelocity(new Vec2(0, ob.getLinearVelocity().y));
      return;
    }
    const duck = other.get(Controller)?.ducking ?? false;
    const zone = hitZoneAt(tipY - c.y, ctx.tuning.height, duck);
    takeDamage(world, other, proj.damage, zone, owner, c.x, c.y);
    shove(ctx, other, aim.x, aim.y, def.knockback, 1.5);
  });

  world.query(Snake, Transform, Health).updateEach(([, st, h], snake) => {
    if (segmentDistance(ot.x, ot.y, tipX, tipY, st.x, st.y) < 0.45) snake.set(Health, { hp: h.hp - proj.damage, maxHp: h.maxHp });
  });

  // Props in the arc take the hit once per swing (bit 31 is reserved for that).
  if (!(proj.hitMask & (1 << 31))) {
    const hit = raycastClosest(world, ot.x, ot.y, tipX, tipY, (h) => h.entity === owner || h.kind === 'player' || h.kind === 'projectile' || h.kind === 'sensor' || h.kind === 'weapon');
    if (hit && world.has(hit.entity as Entity) && (hit.entity as Entity).has(Destructible)) {
      proj.hitMask |= 1 << 31;
      const target = hit.entity as Entity;
      const d = target.get(Destructible);
      if (d) target.set(Destructible, { hp: d.hp - proj.damage, maxHp: d.maxHp });
    }
  }

  proj.fuse -= 1;
  if (proj.fuse <= 0) ctx.pendingDestroy.push(entity);
}

function stepBullet(
  world: World,
  ctx: SimContext,
  entity: Entity,
  proj: ProjectileState,
  def: WeaponDef,
  owner: Entity | undefined,
  swings: Swing[],
  dt: number,
): void {
  // A blade crossing the bullet's path sends it back where it came from, now belonging to the swordsman.
  for (const s of swings) {
    if (s.owner === owner) continue;
    if (segmentDistance(s.ox, s.oy, s.tx, s.ty, proj.x, proj.y) < 0.5) {
      proj.vx *= -1;
      proj.vy *= -1;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      if (owner !== undefined) entity.remove(OwnedBy('*'));
      entity.add(OwnedBy(s.owner));
      proj.ownerGrace = 4;
      emit(world, { type: 'block', player: s.owner, reflected: true, x: proj.x, y: proj.y });
      return;
    }
  }

  const nx = proj.x + proj.vx * dt;
  const ny = proj.y + proj.vy * dt;
  const hit = raycastClosest(world, proj.x, proj.y, nx, ny, (h) => {
    if (h.entity === owner && proj.ownerGrace > 0) return true;
    if (h.kind === 'projectile') return !world.has(h.entity as Entity) || !(h.entity as Entity).has(Snake);
    return false;
  });
  if (hit) {
    const target = hit.entity as Entity;
    if (world.has(target) && target.has(Player) && !target.has(Dead)) {
      const block = shieldBlocks(world, target, hit.x, hit.y);
      if (block === 'reflect') {
        proj.vx *= -1;
        proj.vy *= -1;
        proj.x = hit.x + proj.vx * dt;
        proj.y = hit.y + proj.vy * dt;
        if (owner !== undefined) entity.remove(OwnedBy('*'));
        entity.add(OwnedBy(target));
        emit(world, { type: 'block', player: target, reflected: true, x: hit.x, y: hit.y });
        return;
      }
      if (block === 'absorb') {
        emit(world, { type: 'block', player: target, reflected: false, x: hit.x, y: hit.y });
        ctx.pendingDestroy.push(entity);
        return;
      }
      const tt = target.get(Transform);
      const duck = target.get(Controller)?.ducking ?? false;
      const zone = tt ? hitZoneAt(hit.y - tt.y, ctx.tuning.height, duck) : 'body';
      takeDamage(world, target, proj.damage, zone, owner ?? -1, hit.x, hit.y);
      if (def.projectile.status !== 'none') applyStatus(target, def.projectile.status, 180);
      shove(ctx, target, proj.vx, proj.vy, def.knockback);
    } else if (world.has(target) && target.has(Snake)) {
      const h = target.get(Health);
      if (h) target.set(Health, { hp: h.hp - proj.damage, maxHp: h.maxHp });
      emit(world, { type: 'blood', x: hit.x, y: hit.y, amount: 6 });
    } else if (world.has(target) && target.has(Destructible)) {
      const d = target.get(Destructible);
      if (d) target.set(Destructible, { hp: d.hp - proj.damage, maxHp: d.maxHp });
    }
    if (proj.bounces > 0) {
      proj.bounces -= 1;
      const dot = proj.vx * hit.nx + proj.vy * hit.ny;
      proj.vx = proj.vx - 2 * dot * hit.nx;
      proj.vy = proj.vy - 2 * dot * hit.ny;
      proj.x = hit.x + proj.vx * dt;
      proj.y = hit.y + proj.vy * dt;
      return;
    }
    ctx.pendingDestroy.push(entity);
    return;
  }
  proj.x = nx;
  proj.y = ny;
  if (proj.ownerGrace > 0) proj.ownerGrace -= 1;
}

/** Nearest living fighter within `reach` of (x, y), skipping the owner while their grace lasts. */
function touchingPlayer(world: World, ctx: SimContext, x: number, y: number, reach: number, owner: Entity | undefined, ownerGrace: number): Entity | null {
  let found: Entity | null = null;
  let best = reach;
  world.query(livePlayers).updateEach(([, pt], other) => {
    if (other === owner && ownerGrace > 0) return;
    const c = playerCentre(ctx, other, pt);
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < best) {
      best = d;
      found = other;
    }
  });
  return found;
}

/**
 * Fields come in two flavours. Splats (flame puffs, glue) fly until they touch a fighter or a wall and
 * apply their status on contact. Anchored fields (black hole, time bubble) fly briefly, then open in place
 * and work their radius every tick until they collapse.
 */
function stepField(world: World, ctx: SimContext, entity: Entity, proj: ProjectileState, def: WeaponDef, owner: Entity | undefined, dt: number): void {
  const status = def.projectile.status;
  const hole = def.id === 'black-hole';
  const bubble = status === 'bubble';
  const anchored = hole || bubble;
  const body = ctx.bodies.get(entity);

  if (proj.phase === 0) {
    const reach = Math.min(1, 0.45 + def.projectile.radius * 0.35);
    const touched = touchingPlayer(world, ctx, proj.x, proj.y, reach, owner, proj.ownerGrace);
    let wall = ctx.contactHits.has(entity as unknown as number);
    if (!wall && body) {
      const ahead = raycastClosest(world, proj.x, proj.y, proj.x + proj.vx * dt * 2, proj.y + proj.vy * dt * 2, (h) => h.entity === owner || h.entity === entity || h.kind === 'player' || h.kind === 'projectile' || h.kind === 'sensor');
      if (ahead && ahead.fraction < 1) wall = true;
    }
    if (!anchored) {
      if (touched) {
        takeDamage(world, touched, proj.damage, 'body', owner ?? -1, proj.x, proj.y);
        applyStatus(touched, status, status === 'burn' ? BURN_TICKS : GLUE_TICKS);
        shove(ctx, touched, proj.vx, proj.vy, def.knockback);
        ctx.pendingDestroy.push(entity);
        return;
      }
      if (wall) {
        ctx.pendingDestroy.push(entity);
        return;
      }
      proj.fuse -= 1;
      if (proj.fuse <= 0) ctx.pendingDestroy.push(entity);
      return;
    }
    const flight = hole ? HOLE_FLIGHT_TICKS : BUBBLE_FLIGHT_TICKS;
    proj.fuse -= 1;
    // The bubble shell itself bonks whoever it lands on before it pops open.
    if (touched && bubble && proj.damage > 0) {
      takeDamage(world, touched, proj.damage, 'body', owner ?? -1, proj.x, proj.y);
      shove(ctx, touched, proj.vx, proj.vy, def.knockback);
    }
    if (touched || wall || proj.fuse <= def.projectile.fuse - flight) {
      proj.phase = 1;
      proj.fuse = hole ? HOLE_HOLD_TICKS : BUBBLE_HOLD_TICKS;
      proj.ownerGrace = hole ? HOLE_OWNER_GRACE_TICKS : 0;
      proj.vx = 0;
      proj.vy = 0;
      if (body) {
        body.setLinearVelocity(new Vec2(0, 0));
        body.setActive(false);
      }
      emit(world, { type: 'explosion', x: proj.x, y: proj.y, radius: hole ? 1.2 : 0.8, damage: 0 });
    }
    return;
  }

  const radius = def.projectile.radius;
  if (hole) {
    // Everything loose falls in; fighters who reach the centre are gone. The drag on a fighter is a
    // steep gradient: a tug at the rim you can run out of, a grip near the middle you cannot.
    for (const b of queryBodiesInRadius(world, proj.x, proj.y, radius)) {
      if (b.getType() !== 'dynamic') continue;
      const data = b.getUserData() as FixtureUserData | undefined;
      const e = data?.entity as Entity | undefined;
      const p = b.getPosition();
      const dx = proj.x - p.x;
      const dy = proj.y - p.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const falloff = Math.max(0, 1 - d / radius);
      const isPlayer = e !== undefined && world.has(e) && e.has(Player);
      if (isPlayer) {
        const braced = e === owner && proj.ownerGrace > 0 ? 0.5 : 1;
        const pull = (0.03 + 0.6 * falloff * falloff) * braced;
        const v = b.getLinearVelocity();
        b.setLinearVelocity(new Vec2(v.x + (dx / d) * pull, v.y + (dy / d) * pull));
      } else {
        const mag = (def.projectile.explodeImpulse || 14) * 0.4 * falloff * b.getMass();
        b.applyLinearImpulse(new Vec2((dx / d) * mag, (dy / d) * mag), p);
      }
    }
    world.query(livePlayers).updateEach(([, tr], other) => {
      if (other === owner && proj.ownerGrace > 0) return;
      const c = playerCentre(ctx, other, tr);
      if (Math.hypot(c.x - proj.x, c.y - proj.y) < HOLE_KILL_RADIUS) takeDamage(world, other, 999, 'body', owner ?? -1, c.x, c.y, true);
    });
    world.query(Snake, Transform, Health).updateEach(([, st, h], snake) => {
      if (Math.hypot(st.x - proj.x, st.y - proj.y) < HOLE_KILL_RADIUS) snake.set(Health, { hp: 0, maxHp: h.maxHp });
    });
  } else if (bubble) {
    // Time crawls inside: input is frozen and momentum bleeds off, so fighters hang mid-air and sink slowly.
    world.query(livePlayers).updateEach(([, tr], other) => {
      const c = playerCentre(ctx, other, tr);
      if (Math.hypot(c.x - proj.x, c.y - proj.y) > radius * 0.8) return;
      applyStatus(other, 'bubble', 2);
      const b = ctx.bodies.get(other);
      if (b) {
        const v = b.getLinearVelocity();
        b.setLinearVelocity(new Vec2(v.x * 0.35, v.y * 0.35));
      }
    });
  }
  if (proj.ownerGrace > 0) proj.ownerGrace -= 1;
  proj.fuse -= 1;
  if (proj.fuse <= 0) {
    emit(world, { type: 'explosion', x: proj.x, y: proj.y, radius: hole ? 1.5 : 0.6, damage: 0 });
    ctx.pendingDestroy.push(entity);
  }
}

function stepExplosive(world: World, ctx: SimContext, entity: Entity, proj: ProjectileState, def: WeaponDef, owner: Entity | undefined, dt: number): void {
  const body = ctx.bodies.get(entity);
  const reach = 0.85 + (def.projectile.radius > 1 ? 0.5 : 0);
  const touched = touchingPlayer(world, ctx, proj.x, proj.y, reach, owner, proj.ownerGrace);
  let hitSurface = ctx.contactHits.has(entity as unknown as number);
  if (!hitSurface && body) {
    const ahead = raycastClosest(world, proj.x, proj.y, proj.x + proj.vx * dt * 2, proj.y + proj.vy * dt * 2, (h) => h.entity === owner || h.entity === entity || h.kind === 'player' || h.kind === 'projectile' || h.kind === 'sensor');
    if (ahead && ahead.fraction < 1) hitSurface = true;
  }
  // Rockets and bursting shells go off on anything. Grenades detonate on a direct hit but otherwise
  // ride out their fuse, unless they are splash rounds (no bounces), which pop wherever they land.
  const contactExplode =
    proj.kind === ProjectileKind.Rocket ||
    proj.kind === ProjectileKind.BurstInto ||
    (proj.kind === ProjectileKind.Grenade && (touched !== null || def.projectile.bounce === 0));
  if ((touched !== null || hitSurface) && contactExplode) {
    if (proj.kind === ProjectileKind.BurstInto) burst(world, proj, def, owner);
    explode(world, proj.x, proj.y, proj.defId, owner);
    ctx.pendingDestroy.push(entity);
    return;
  }
  // Once a bouncing shell has touched down it sheds speed fast, so it goes off near where it landed.
  if (hitSurface && body && body.getLinearDamping() === 0) {
    body.setLinearDamping(2.5);
    body.setAngularDamping(2);
  }
  if (proj.fuse > 0) {
    proj.fuse -= 1;
    if (proj.fuse <= 0) {
      if (proj.kind === ProjectileKind.BurstInto) burst(world, proj, def, owner);
      explode(world, proj.x, proj.y, proj.defId, owner);
      ctx.pendingDestroy.push(entity);
    }
  }
}

function stepBeam(world: World, ctx: SimContext, entity: Entity, proj: ProjectileState, def: WeaponDef, owner: Entity | undefined): void {
  const aim = owner ? owner.get(Aim) : undefined;
  const ot = owner ? owner.get(Transform) : undefined;
  if (aim && ot) {
    const hit = raycastClosest(world, ot.x, ot.y, ot.x + aim.x * 40, ot.y + aim.y * 40, (h) => h.entity === owner || h.kind === 'projectile' || h.kind === 'sensor');
    if (hit && world.has(hit.entity as Entity) && (hit.entity as Entity).has(Player)) {
      takeDamage(world, hit.entity as Entity, proj.damage, 'body', owner ?? -1, hit.x, hit.y);
      if (def.projectile.status !== 'none') applyStatus(hit.entity as Entity, def.projectile.status, BURN_TICKS);
    }
  }
  if (def.projectile.beamTicks > 0) proj.fuse = proj.fuse || def.projectile.beamTicks;
  if (proj.fuse > 0) {
    proj.fuse -= 1;
    if (proj.fuse <= 0) ctx.pendingDestroy.push(entity);
  }
}

export function projectiles(world: World): void {
  const ctx = getContext(world);
  const dt = 1 / ctx.tuning.tickRate;

  // Active blades, gathered up front so bullets can be parried against them this tick.
  const swings: Swing[] = [];
  world.query(bullets).updateEach(([proj], entity) => {
    if (proj.kind !== ProjectileKind.Melee) return;
    const owner = ownerOf(entity);
    const ot = owner?.get(Transform);
    const aim = owner?.get(Aim);
    if (!owner || !ot || !aim) return;
    const reach = SWING_BASE_REACH + weaponByIndex(proj.defId).projectile.radius;
    swings.push({ owner, ox: ot.x, oy: ot.y, tx: ot.x + aim.x * reach, ty: ot.y + aim.y * reach });
  });

  world.query(bullets).updateEach(([proj], entity) => {
    if (entity.has(Snake)) return;
    const owner = ownerOf(entity);
    const def = weaponByIndex(proj.defId);
    const body = ctx.bodies.get(entity);

    if (proj.kind === ProjectileKind.Bullet || proj.kind === ProjectileKind.Pellet) {
      stepBullet(world, ctx, entity, proj, def, owner, swings, dt);
      return;
    }
    if (proj.kind === ProjectileKind.Melee) {
      stepSwing(world, ctx, entity, proj, def, owner);
      return;
    }

    if (body) {
      const p = body.getPosition();
      const v = body.getLinearVelocity();
      proj.x = p.x;
      proj.y = p.y;
      if (body.isActive()) {
        proj.vx = v.x;
        proj.vy = v.y;
      }
    } else {
      proj.vy -= proj.gravity * dt;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
    }
    if (proj.kind !== ProjectileKind.Field && proj.ownerGrace > 0) proj.ownerGrace -= 1;

    switch (proj.kind) {
      case ProjectileKind.Field:
        stepField(world, ctx, entity, proj, def, owner, dt);
        return;
      case ProjectileKind.Grenade:
      case ProjectileKind.Rocket:
      case ProjectileKind.BurstInto:
        stepExplosive(world, ctx, entity, proj, def, owner, dt);
        return;
      case ProjectileKind.Beam:
        stepBeam(world, ctx, entity, proj, def, owner);
        return;
      case ProjectileKind.Creature:
        // The shell hatches on its first tick, keeping the muzzle velocity so snakes actually fly.
        spawnSnake(world, proj.x, proj.y, owner, def.id.includes('launcher'), def.id.includes('flying'), proj.vx, proj.vy);
        ctx.pendingDestroy.push(entity);
        return;
      default:
        if (proj.fuse > 0) {
          proj.fuse -= 1;
          if (proj.fuse <= 0) ctx.pendingDestroy.push(entity);
        }
    }
  });

  world.query(Weapon, Loose, Transform).updateEach(([wep, t], entity) => {
    if (!wep.thrown || wep.thrownHit) return;
    const thrower = ownerOf(entity);
    world.query(livePlayers).updateEach(([, pt], other) => {
      if (wep.thrownHit) return;
      if (other === thrower) return;
      const dx = pt.x - t.x;
      const dy = pt.y - t.y;
      if (dx * dx + dy * dy < 0.7 * 0.7) {
        const block = shieldBlocks(world, other, t.x, t.y);
        if (block !== 'none') {
          emit(world, { type: 'block', player: other, reflected: false, x: t.x, y: t.y });
          wep.thrownHit = true;
          return;
        }
        takeDamage(world, other, ctx.tuning.thrownDamage, 'body', thrower ?? -1, pt.x, pt.y);
        wep.thrownHit = true;
      }
    });
  });

  world.query(Snake, Transform, Health).updateEach(([snake, st, health], entity) => {
    if (health.hp <= 0) {
      emit(world, { type: 'blood', x: st.x, y: st.y, amount: 12 });
      ctx.pendingDestroy.push(entity);
      return;
    }
    if (snake.biteCooldown > 0) snake.biteCooldown -= 1;
    if (snake.grace > 0) snake.grace -= 1;
    const owner = ownerOf(entity);
    const body = ctx.bodies.get(entity);
    if (!body) return;
    const v = body.getLinearVelocity();
    // Fresh out of the barrel a snake is a projectile: let it sail before it starts hunting.
    const ballistic = snake.grace > SNAKE_GRACE_TICKS - 30 && (snake.flying === 1 || Math.abs(v.y) > 0.5);
    if (ballistic) return;

    const nearest = { cur: null as { e: Entity; d: number; x: number; y: number } | null };
    world.query(livePlayers).updateEach(([, pt], other) => {
      if (other === owner && snake.grace > 0) return;
      const c = playerCentre(ctx, other, pt);
      const d = Math.hypot(c.x - st.x, c.y - st.y);
      if (!nearest.cur || d < nearest.cur.d) nearest.cur = { e: other, d, x: c.x, y: c.y };
    });
    const n = nearest.cur;
    if (!n) return;
    const dirx = n.x - st.x;
    const diry = n.y - st.y;
    const len = Math.hypot(dirx, diry) || 1;
    const speed = snake.flying ? 6 : snake.giant ? 3.5 : 4.5;
    if (snake.flying) {
      body.setLinearVelocity(new Vec2((dirx / len) * speed, (diry / len) * speed));
    } else {
      const resting = Math.abs(v.y) < 0.05;
      // Slither toward the target; hop when it is above us or now and then for the wriggle.
      const hop = resting && (diry > 0.6 || (n.d > 1.2 && ctx.rng.next() < 0.03));
      body.setLinearVelocity(new Vec2(Math.sign(dirx) * Math.min(speed, Math.abs(dirx) * 4), hop ? 6.5 : v.y));
    }
    if (n.d < 0.55 && snake.biteCooldown <= 0) {
      takeDamage(world, n.e, snake.giant ? 25 : 5, 'body', owner ?? entity, n.x, n.y);
      snake.biteCooldown = 20;
    }
  });
}

function spawnBulletLike(world: World, x: number, y: number, vx: number, vy: number, damage: number, owner?: Entity): void {
  const proj = world.spawn(
    Projectile({
      kind: ProjectileKind.Bullet,
      damage,
      speed: Math.hypot(vx, vy),
      bounces: 0,
      fuse: 0,
      x,
      y,
      vx,
      vy,
      gravity: 0,
      ownerGrace: 0,
      defId: 1,
    }),
  );
  if (owner) proj.add(OwnedBy(owner));
  assignNetId(world, proj);
}
