import { createQuery, Not, type Entity, type World } from 'koota';
import { Vec2 } from 'planck';
import { emit, getContext } from '../context';
import { applyExplosion, raycastClosest } from '../physics/queries';
import { takeDamage, hitZoneAt } from '../player/health';
import { assignNetId, createBoxBody, registerBody } from '../physics/bodies';
import {
  Aim,
  Combat,
  Controller,
  Dead,
  Destructible,
  Health,
  Loose,
  OwnedBy,
  Player,
  Projectile,
  ProjectileKind,
  Snake,
  Status,
  Transform,
  Weapon,
} from '../traits';
import { weaponByIndex } from '../weapons/defs';
import type { FixtureUserData } from '../physics/categories';

const bullets = createQuery(Projectile);

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

function shieldBlocks(world: World, blocker: Entity, hx: number, hy: number, vx: number, vy: number): 'none' | 'absorb' | 'reflect' {
  const combat = blocker.get(Combat);
  const aim = blocker.get(Aim);
  const t = blocker.get(Transform);
  if (!combat?.blocking || !aim || !t) return 'none';
  const ctx = getContext(world);
  const toHitX = hx - t.x;
  const toHitY = hy - t.y;
  const incomingX = -vx;
  const incomingY = -vy;
  const hitDir = Math.atan2(toHitY, toHitX);
  const aimDir = Math.atan2(aim.y, aim.x);
  let delta = Math.abs(hitDir - aimDir);
  if (delta > Math.PI) delta = 2 * Math.PI - delta;
  const arc = (ctx.tuning.blockArcDeg * Math.PI) / 180 / 2;
  if (delta > arc) return 'none';
  const inWindow = ctx.tick - combat.blockStartTick <= ctx.tuning.perfectBlockTicks;
  void incomingX;
  void incomingY;
  return inWindow ? 'reflect' : 'absorb';
}

function explode(world: World, x: number, y: number, defId: number, owner?: Entity): void {
  const def = weaponByIndex(defId);
  const radius = def.projectile.radius || 2;
  const damage = def.projectile.explodeDamage || def.projectile.damage;
  emit(world, { type: 'explosion', x, y, radius, damage });
  applyExplosion(world, x, y, radius, def.projectile.explodeImpulse || 8, (body, falloff) => {
    const data = body.getUserData() as FixtureUserData | undefined;
    if (!data) return;
    const target = data.entity as Entity;
    if (!world.has(target)) return;
    if (target.has(Player) && !target.has(Dead)) {
      takeDamage(world, target, damage * falloff, 'body', owner ?? -1, x, y);
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

function spawnSnake(world: World, x: number, y: number, owner: Entity | undefined, giant: boolean, flying: boolean): void {
  const ctx = getContext(world);
  const hp = (ctx.settings.maxHp || 100) * (giant ? 2 : 1);
  const snake = world.spawn(
    Snake({ hp, giant: giant ? 1 : 0, flying: flying ? 1 : 0, biteCooldown: 0 }),
    Health({ hp, maxHp: hp }),
    Transform({ x, y, angle: 0 }),
  );
  if (owner) snake.add(OwnedBy(owner));
  assignNetId(world, snake);
  const body = createBoxBody(ctx.physics, snake, 'projectile', x, y, giant ? 0.35 : 0.18, giant ? 0.18 : 0.1, 'dynamic', {
    density: 0.5,
    friction: 0.3,
    fixedRotation: true,
  });
  if (flying) body.setGravityScale(0);
  registerBody(world, snake, body);
}

export function projectiles(world: World): void {
  const ctx = getContext(world);
  const dt = 1 / ctx.tuning.tickRate;

  world.query(bullets).updateEach(([proj], entity) => {
    const owner = ownerOf(entity);
    const def = weaponByIndex(proj.defId);
    const body = ctx.bodies.get(entity);

    if (proj.kind === ProjectileKind.Bullet || proj.kind === ProjectileKind.Pellet) {
      const nx = proj.x + proj.vx * dt;
      const ny = proj.y + proj.vy * dt;
      const hit = raycastClosest(world, proj.x, proj.y, nx, ny, (h) => {
        if (h.entity === owner && proj.ownerGrace > 0) return true;
        if (h.kind === 'projectile') return true;
        return false;
      });
      if (hit) {
        const target = hit.entity as Entity;
        if (world.has(target) && target.has(Player) && !target.has(Dead)) {
          const block = shieldBlocks(world, target, hit.x, hit.y, proj.vx, proj.vy);
          if (block === 'reflect') {
            proj.vx *= -1;
            proj.vy *= -1;
            proj.x = hit.x + proj.vx * dt;
            proj.y = hit.y + proj.vy * dt;
            if (owner !== undefined) entity.remove(OwnedBy('*'));
            entity.add(OwnedBy(target));
            emit(world, { type: 'block', player: target, reflected: true });
            return;
          }
          if (block === 'absorb') {
            emit(world, { type: 'block', player: target, reflected: false });
            ctx.pendingDestroy.push(entity);
            return;
          }
          const tt = target.get(Transform);
          const duck = target.get(Controller)?.ducking ?? false;
          const zone = tt ? hitZoneAt(hit.y - tt.y, ctx.tuning.height, duck) : 'body';
          takeDamage(world, target, proj.damage, zone, owner ?? -1, hit.x, hit.y);
          if (def.projectile.status !== 'none') applyStatus(target, def.projectile.status, 180);
          const kb = def.knockback;
          const tb = ctx.bodies.get(target);
          if (tb) {
            const v = tb.getLinearVelocity();
            const dir = Math.hypot(proj.vx, proj.vy) || 1;
            tb.setLinearVelocity(new Vec2(v.x + (proj.vx / dir) * kb, v.y + (proj.vy / dir) * kb));
          }
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
      return;
    }

    if (body) {
      const p = body.getPosition();
      const v = body.getLinearVelocity();
      proj.x = p.x;
      proj.y = p.y;
      proj.vx = v.x;
      proj.vy = v.y;
    } else {
      proj.vy -= proj.gravity * dt;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
    }
    if (proj.ownerGrace > 0) proj.ownerGrace -= 1;

    const explosive =
      proj.kind === ProjectileKind.Grenade ||
      proj.kind === ProjectileKind.Rocket ||
      proj.kind === ProjectileKind.BurstInto ||
      proj.kind === ProjectileKind.Field;
    if (explosive && proj.ownerGrace <= 0) {
      let hitSomething = false;
      world.query(Player, Transform, Not(Dead)).updateEach(([_pl, pt], other) => {
        if (other === owner) return;
        const ob = ctx.bodies.get(other);
        const ox = ob?.getPosition().x ?? pt.x;
        const oy = ob?.getPosition().y ?? pt.y;
        const reach = 0.85 + (def.projectile.radius > 1 ? 0.5 : 0);
        if (Math.hypot(ox - proj.x, oy - proj.y) < reach) {
          hitSomething = true;
        }
      });
      if (!hitSomething && body) {
        const ahead = raycastClosest(
          world,
          proj.x,
          proj.y,
          proj.x + proj.vx * dt * 2,
          proj.y + proj.vy * dt * 2,
          (h) => h.entity === owner || h.entity === entity,
        );
        if (ahead && ahead.fraction < 1) hitSomething = true;
      }
      if (ctx.contactHits.has(entity as unknown as number)) hitSomething = true;
      const contactExplode =
        proj.kind === ProjectileKind.Rocket ||
        proj.kind === ProjectileKind.BurstInto ||
        proj.kind === ProjectileKind.Field ||
        (proj.kind === ProjectileKind.Grenade && proj.fuse <= 0);
      if (hitSomething && contactExplode) {
        if (proj.kind === ProjectileKind.BurstInto) {
          const burst = def.projectile.burstInto === 'snake' ? 'snake' : 'spike';
          const count = def.projectile.burstCount ?? 4;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            if (burst === 'snake') spawnSnake(world, proj.x, proj.y, owner, false, false);
            else spawnBulletLike(world, proj.x, proj.y, Math.cos(a) * 18, Math.sin(a) * 18, 10, owner);
          }
        }
        explode(world, proj.x, proj.y, proj.defId, owner);
        ctx.pendingDestroy.push(entity);
        return;
      }
    }

    if (proj.fuse > 0) {
      proj.fuse -= 1;
      if (proj.fuse <= 0) {
        if (proj.kind === ProjectileKind.BurstInto) {
          const burst = def.projectile.burstInto === 'snake' ? 'snake' : 'spike';
          const count = def.projectile.burstCount ?? 4;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            if (burst === 'snake') spawnSnake(world, proj.x, proj.y, owner, false, false);
            else {
              spawnBulletLike(world, proj.x, proj.y, Math.cos(a) * 18, Math.sin(a) * 18, 10, owner);
            }
          }
        }
        explode(world, proj.x, proj.y, proj.defId, owner);
        ctx.pendingDestroy.push(entity);
        return;
      }
    }

    if (proj.kind === ProjectileKind.Beam) {
      const aim = owner ? owner.get(Aim) : undefined;
      const ot = owner ? owner.get(Transform) : undefined;
      if (aim && ot) {
        const hit = raycastClosest(world, ot.x, ot.y, ot.x + aim.x * 40, ot.y + aim.y * 40, (h) => h.entity === owner);
        if (hit && world.has(hit.entity as Entity) && (hit.entity as Entity).has(Player)) {
          takeDamage(world, hit.entity as Entity, proj.damage, 'body', owner ?? -1, hit.x, hit.y);
        }
      }
      if (def.projectile.beamTicks > 0) {
        proj.fuse = proj.fuse || def.projectile.beamTicks;
      }
    }

    if (proj.kind === ProjectileKind.Creature && !entity.has(Snake)) {
      spawnSnake(world, proj.x, proj.y, owner, def.id.includes('launcher'), def.id.includes('flying'));
      ctx.pendingDestroy.push(entity);
    }

    if (proj.kind === ProjectileKind.Field && def.id === 'black-hole') {
      applyExplosion(world, proj.x, proj.y, def.projectile.radius, -14);
      world.query(Player, Transform, Not(Dead)).updateEach(([_p, tr], other) => {
        const d = Math.hypot(tr.x - proj.x, tr.y - proj.y);
        if (d < 0.6) takeDamage(world, other, 999, 'body', owner ?? -1, tr.x, tr.y, true);
      });
    }
  });

  world.query(Weapon, Loose, Transform).updateEach(([wep, t], entity) => {
    if (!wep.thrown || wep.thrownHit) return;
    world.query(Player, Transform, Not(Dead)).updateEach(([_p, pt], other) => {
      if (wep.thrownHit) return;
      if (other === ownerOf(entity)) return;
      const dx = pt.x - t.x;
      const dy = pt.y - t.y;
      if (dx * dx + dy * dy < 0.7 * 0.7) {
        const block = shieldBlocks(world, other, t.x, t.y, dx, dy);
        if (block !== 'none') {
          emit(world, { type: 'block', player: other, reflected: false });
          wep.thrownHit = true;
          return;
        }
        takeDamage(world, other, ctx.tuning.thrownDamage, 'body', ownerOf(entity) ?? -1, pt.x, pt.y);
        wep.thrownHit = true;
      }
    });
  });

  world.query(Snake, Transform, Health).updateEach(([snake, st, health], entity) => {
    if (health.hp <= 0) {
      ctx.pendingDestroy.push(entity);
      return;
    }
    if (snake.biteCooldown > 0) snake.biteCooldown -= 1;
    const nearest = { cur: null as { e: Entity; d: number; x: number; y: number } | null };
    world.query(Player, Transform, Not(Dead)).updateEach(([_p, pt], other) => {
      const d = Math.hypot(pt.x - st.x, pt.y - st.y);
      if (!nearest.cur || d < nearest.cur.d) nearest.cur = { e: other, d, x: pt.x, y: pt.y };
    });
    const body = ctx.bodies.get(entity);
    const n = nearest.cur;
    if (n && body) {
      const dirx = n.x - st.x;
      const diry = n.y - st.y;
      const len = Math.hypot(dirx, diry) || 1;
      const speed = snake.flying ? 6 : 4;
      const v = body.getLinearVelocity();
      body.setLinearVelocity(
        new Vec2(
          (dirx / len) * speed,
          snake.flying ? (diry / len) * speed : v.y + (n.d > 1.5 && body.getLinearVelocity().y < 1 ? 6 : 0),
        ),
      );
      if (n.d < 0.55 && snake.biteCooldown <= 0) {
        takeDamage(world, n.e, snake.giant ? 25 : 5, 'body', ownerOf(entity) ?? entity, n.x, n.y);
        snake.biteCooldown = 20;
      }
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
