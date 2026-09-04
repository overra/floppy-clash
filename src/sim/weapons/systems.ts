import { createQuery, type Entity, type World } from 'koota';
import { Vec2 } from 'planck';
import { emit, getContext } from '../context';
import { rising } from '../input';
import { createBoxBody, registerBody, assignNetId } from '../physics/bodies';
import { Aim, Combat, Controller, Dead, Held, HeldBy, Loose, OwnedBy, Player, Projectile, ProjectileKind, Transform, Weapon } from '../traits';
import type { WeaponDef } from './schema';
import { weaponIndex } from './defs';
import { weaponDef } from './resolve';
import { SWING_TICKS } from './projectiles';
import { raycastClosest } from '../physics/queries';
import { combatAllowed } from '../rules/rounds';

/** Blink dagger: hop this far along the aim, stopping short of the first wall in the way. */
const BLINK_DISTANCE = 4;

const holders = createQuery(Player, Aim, Combat, Transform);
const looseWeapons = createQuery(Weapon, Loose, Transform);

function kindId(kind: WeaponDef['projectile']['kind']): number {
  switch (kind) {
    case 'bullet':
      return ProjectileKind.Bullet;
    case 'pellets':
      return ProjectileKind.Pellet;
    case 'grenade':
      return ProjectileKind.Grenade;
    case 'rocket':
      return ProjectileKind.Rocket;
    case 'beam':
      return ProjectileKind.Beam;
    case 'melee':
      return ProjectileKind.Melee;
    case 'field':
      return ProjectileKind.Field;
    case 'creature':
      return ProjectileKind.Creature;
    case 'burst-into':
      return ProjectileKind.BurstInto;
    default:
      return ProjectileKind.Bullet;
  }
}

function spawnBullet(
  world: World,
  owner: Entity,
  def: WeaponDef,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  extraSpread = 0,
): void {
  const ctx = getContext(world);
  const spread = ((def.projectile.spreadDeg + extraSpread) * Math.PI) / 180;
  const angle = Math.atan2(dirY, dirX) + (ctx.rng.next() - 0.5) * spread;
  const speed = def.projectile.speed;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const proj = world.spawn(
    Projectile({
      kind: kindId(def.projectile.kind),
      damage: def.projectile.damage,
      speed,
      bounces: def.projectile.bounce,
      fuse: def.projectile.kind === 'melee' ? SWING_TICKS : def.projectile.kind === 'rocket' && def.projectile.fuse === 0 ? 180 : def.projectile.fuse,
      x,
      y,
      vx,
      vy,
      gravity: def.projectile.gravity,
      ownerGrace: ctx.tuning.ownerGraceTicks,
      defId: weaponIndex(def.id),
    }),
    OwnedBy(owner),
  );
  assignNetId(world, proj);
  const needsBody =
    def.projectile.kind === 'grenade' ||
    def.projectile.kind === 'rocket' ||
    def.projectile.kind === 'field' ||
    def.projectile.kind === 'creature' ||
    def.projectile.kind === 'burst-into';
  if (needsBody) {
    // `projectile.radius` is the blast / field reach, not the shell: the body is a fist-sized
    // object that rides through gaps and bounces like a grenade should.
    const half = def.projectile.kind === 'field' ? 0.2 : def.projectile.burstInto === 'spike' ? 0.22 : 0.14;
    const body = createBoxBody(
      ctx.physics,
      proj,
      'projectile',
      x,
      y,
      half,
      half,
      'dynamic',
      { density: 0.4, friction: 0.2, restitution: def.projectile.bounce > 0 ? 0.55 : 0.05, bullet: true, fixedRotation: false },
    );
    body.setLinearVelocity(new Vec2(vx, vy));
    body.setGravityScale(def.projectile.gravity > 0 ? def.projectile.gravity / ctx.tuning.gravity : 0);
    registerBody(world, proj, body);
  }
}

export function spawnWeapon(world: World, defId: string, x: number, y: number, loose = true): Entity {
  const ctx = getContext(world);
  const def = weaponDef(ctx.weapons, weaponIndex(defId));
  const entity = world.spawn(
    Weapon({
      defId: weaponIndex(def.id),
      ammo: def.ammo,
      pickupCooldown: 0,
      thrown: false,
      thrownHit: false,
    }),
    Transform({ x, y, angle: 0 }),
  );
  assignNetId(world, entity);
  if (loose) entity.add(Loose());
  const body = createBoxBody(ctx.physics, entity, 'weapon', x, y, 0.28, 0.12, 'dynamic', {
    density: 0.35,
    friction: 0.4,
    restitution: 0.1,
    fixedRotation: false,
  });
  registerBody(world, entity, body);
  emit(world, { type: 'spawn', kind: `weapon:${def.id}`, netId: entity.get(Transform) ? ctx.ids.peek() - 1 : 0 });
  return entity;
}

function heldWeapon(world: World, player: Entity): Entity | undefined {
  for (const weapon of world.query(Weapon, Held)) {
    if (weapon.targetFor(HeldBy) === player) return weapon;
  }
  return undefined;
}

export function weapons(world: World): void {
  const ctx = getContext(world);
  const live = combatAllowed(world);

  world.query(looseWeapons).updateEach(([weapon]) => {
    if (weapon.pickupCooldown > 0) weapon.pickupCooldown -= 1;
  });

  world.query(holders).updateEach(([player, aim, combat, transform], entity) => {
    if (entity.has(Dead)) return;
    const input = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
    const prev = ctx.prevInputs[player.inputIndex] ?? ctx.prevInputs[player.slot];
    if (!input) return;

    let held = heldWeapon(world, entity);
    if (!held) {
      world.query(looseWeapons).updateEach(([wep, wt], weaponEntity) => {
        if (held) return;
        if (wep.pickupCooldown > 0) return;
        const dx = wt.x - transform.x;
        const dy = wt.y - transform.y;
        if (dx * dx + dy * dy < 0.85 * 0.85) {
          weaponEntity.remove(Loose);
          weaponEntity.add(Held(), HeldBy(entity));
          const def = weaponDef(ctx.weapons, wep.defId);
          // Mutate the updateEach view so Koota writeback keeps the refill.
          wep.ammo = ctx.tuning.refillOnPickup ? def.ammo : wep.ammo;
          wep.thrown = false;
          wep.thrownHit = false;
          wep.pickupCooldown = 0;
          const body = ctx.bodies.get(weaponEntity);
          body?.setActive(false);
          held = weaponEntity;
          emit(world, { type: 'pickup', player: entity, weaponId: def.id });
        }
      });
    }

    if (!held) return;
    const wep = held.get(Weapon);
    if (!wep) return;
    const def = weaponDef(ctx.weapons, wep.defId);
    const body = ctx.bodies.get(entity);
    if (!body) return;

    if (rising(prev?.throw ?? false, input.throw)) {
      held.remove(Held);
      held.add(Loose());
      held.remove(HeldBy('*'));
      // The thrower owns the throw: it is released inside their own hit radius and must not count on them.
      held.remove(OwnedBy('*'));
      held.add(OwnedBy(entity));
      held.set(Weapon, {
        ...wep,
        thrown: true,
        thrownHit: false,
        pickupCooldown: ctx.tuning.pickupCooldownTicks,
      });
      const wbody = ctx.bodies.get(held);
      if (wbody) {
        wbody.setActive(true);
        wbody.setPosition(new Vec2(transform.x + aim.x * 0.6, transform.y + aim.y * 0.6));
        const pv = body.getLinearVelocity();
        wbody.setLinearVelocity(
          new Vec2(pv.x + aim.x * ctx.tuning.throwSpeed, pv.y + aim.y * ctx.tuning.throwSpeed),
        );
      }
      emit(world, { type: 'throw', player: entity, weaponId: def.id });
      return;
    }

    if (combat.blocking || combat.stun > 0 || !live) return;
    const fireEdge = rising(prev?.attack ?? false, input.attack);
    const fireHeld = input.attack;
    const canFire =
      (def.fireMode === 'semi' && fireEdge) ||
      (def.fireMode === 'auto' && fireHeld) ||
      (def.fireMode === 'burst' && fireEdge) ||
      (def.fireMode === 'hold' && fireHeld);
    const cd = ctx.fireCd.get(entity) ?? 0;
    if (cd > 0) ctx.fireCd.set(entity, cd - 1);
    if (!canFire || (ctx.fireCd.get(entity) ?? 0) > 0) return;
    if (!def.infiniteAmmo && wep.ammo <= 0) {
      if (ctx.tuning.flingWhenEmpty) {
        held.remove(Held);
        held.add(Loose());
        held.remove(HeldBy('*'));
        held.set(Weapon, { ...wep, pickupCooldown: ctx.tuning.pickupCooldownTicks, thrown: true });
        ctx.bodies.get(held)?.setActive(true);
      }
      return;
    }

    ctx.fireCd.set(entity, def.fireIntervalTicks);
    if (def.id === 'blink-dagger') {
      // Teleport first so the swing that follows lands where the fighter reappears: stop short of walls,
      // and short of the first enemy on the line so the blade arrives in range.
      const wall = raycastClosest(world, transform.x, transform.y, transform.x + aim.x * BLINK_DISTANCE, transform.y + aim.y * BLINK_DISTANCE, (h) => h.entity === entity || (h.kind !== 'solid' && h.kind !== 'prop' && h.kind !== 'player'));
      const dist = wall ? Math.max(0, wall.fraction * BLINK_DISTANCE - (wall.kind === 'player' ? 0.7 : 0.4)) : BLINK_DISTANCE;
      const px = transform.x + aim.x * dist;
      const py = transform.y + aim.y * dist;
      body.setPosition(new Vec2(px, py));
      body.setLinearVelocity(new Vec2(aim.x * 3, Math.max(0, aim.y * 3)));
      entity.set(Transform, { x: px, y: py, angle: transform.angle });
      transform.x = px;
      transform.y = py;
      emit(world, { type: 'explosion', x: px, y: py, radius: 0.6, damage: 0 });
    }
    const shots = def.projectile.kind === 'pellets' ? def.projectile.count : def.fireMode === 'burst' ? (def.burstCount ?? 3) : 1;
    const muzzleX = transform.x + aim.x * (0.45 + def.shape.length * 0.5);
    const muzzleY = transform.y + aim.y * (0.45 + def.shape.length * 0.5);
    for (let i = 0; i < shots; i++) {
      spawnBullet(world, entity, def, muzzleX, muzzleY, aim.x, aim.y);
    }
    if (!def.infiniteAmmo) {
      held.set(Weapon, { ...wep, ammo: wep.ammo - 1 });
    }
    const vel = body.getLinearVelocity();
    body.setLinearVelocity(
      new Vec2(vel.x - aim.x * def.recoil.back + aim.x * def.recoil.forward, vel.y + def.recoil.up - aim.y * def.recoil.back),
    );
    emit(world, { type: 'shot', source: entity, weaponId: def.id, x: muzzleX, y: muzzleY, aimX: aim.x, aimY: aim.y });
    void Controller;
  });
}
