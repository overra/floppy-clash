import { createQuery, type Entity, type World } from 'koota';
import { Vec2 } from 'planck';
import { emit, getContext } from '../context';
import { rising } from '../input';
import { createBoxBody, registerBody, assignNetId } from '../physics/bodies';
import { Aim, Combat, Controller, Dead, Held, HeldBy, Loose, OwnedBy, Player, Projectile, ProjectileKind, Transform, Weapon } from '../traits';
import type { WeaponDef } from './schema';
import { weaponByIndex, weaponIndex } from './defs';
import { rollIfRanged } from './mapping';
import { takeDamage } from '../player/health';

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
  const damage = rollIfRanged(
    ctx.rng,
    def.projectile.damageMin,
    def.projectile.damageMax,
    def.projectile.damage,
  );
  const proj = world.spawn(
    Projectile({
      kind: kindId(def.projectile.kind),
      damage,
      speed,
      bounces: def.projectile.bounce,
      fuse: def.projectile.kind === 'rocket' && def.projectile.fuse === 0 ? 180 : def.projectile.fuse,
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
    const body = createBoxBody(
      ctx.physics,
      proj,
      'projectile',
      x,
      y,
      Math.max(0.12, def.projectile.radius * 0.35),
      Math.max(0.12, def.projectile.radius * 0.35),
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
  const def = weaponByIndex(weaponIndex(defId));
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
          const def = weaponByIndex(wep.defId);
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
    const def = weaponByIndex(wep.defId);
    const body = ctx.bodies.get(entity);
    if (!body) return;

    if (rising(prev?.throw ?? false, input.throw)) {
      ctx.burstLeft.delete(entity);
      held.remove(Held);
      held.add(Loose());
      held.remove(HeldBy('*'));
      held.set(Weapon, {
        ...wep,
        thrown: true,
        thrownHit: false,
        pickupCooldown: ctx.tuning.pickupCooldownTicks,
      });
      const tx = transform.x + aim.x * 0.6;
      const ty = transform.y + aim.y * 0.6;
      held.set(Transform, { x: tx, y: ty, angle: 0 });
      held.add(OwnedBy(entity));
      const wbody = ctx.bodies.get(held);
      if (wbody) {
        wbody.setActive(true);
        wbody.setPosition(new Vec2(tx, ty));
        const pv = body.getLinearVelocity();
        wbody.setLinearVelocity(
          new Vec2(pv.x + aim.x * ctx.tuning.throwSpeed, pv.y + aim.y * ctx.tuning.throwSpeed),
        );
      }
      emit(world, { type: 'throw', player: entity, weaponId: def.id });
      return;
    }

    if (combat.blocking) {
      ctx.burstLeft.delete(entity);
      return;
    }
    const fireEdge = rising(prev?.attack ?? false, input.attack);
    const fireHeld = input.attack;
    if (def.fireMode === 'burst' && fireEdge) {
      ctx.burstLeft.set(entity, def.burstCount ?? 3);
    }
    const bursting = (ctx.burstLeft.get(entity) ?? 0) > 0;
    const canFire =
      (def.fireMode === 'semi' && fireEdge) ||
      (def.fireMode === 'auto' && fireHeld) ||
      (def.fireMode === 'burst' && bursting) ||
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
    if (def.fireMode === 'burst') {
      const left = (ctx.burstLeft.get(entity) ?? 1) - 1;
      if (left <= 0) ctx.burstLeft.delete(entity);
      else ctx.burstLeft.set(entity, left);
    }
    const shots = Math.max(1, def.projectile.count ?? 1);
    const muzzleX = transform.x + aim.x * (0.45 + def.shape.length * 0.5);
    const muzzleY = transform.y + aim.y * (0.45 + def.shape.length * 0.5);
    for (let i = 0; i < shots; i++) {
      spawnBullet(world, entity, def, muzzleX, muzzleY, aim.x, aim.y);
    }
    // PLAN Appendix C M16: ammo counts burst sequences (30 bursts), not bullets.
    if (!def.infiniteAmmo && (def.fireMode !== 'burst' || fireEdge)) {
      held.set(Weapon, { ...wep, ammo: wep.ammo - 1 });
    }
    const vel = body.getLinearVelocity();
    body.setLinearVelocity(
      new Vec2(vel.x - aim.x * def.recoil.back + aim.x * def.recoil.forward, vel.y + def.recoil.up - aim.y * def.recoil.back),
    );
    emit(world, { type: 'shot', source: entity, weaponId: def.id, x: muzzleX, y: muzzleY, aimX: aim.x, aimY: aim.y });
    if (def.id === 'blink-dagger') {
      // PLAN Appendix C: teleport forward, damage at destination (same tick).
      transform.x += aim.x * 4;
      transform.y += aim.y * 4;
      body.setPosition(new Vec2(transform.x, transform.y));
    }
    void takeDamage;
    void Controller;
  });
}
