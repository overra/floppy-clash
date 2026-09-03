import { createQuery, Not, type Entity, type World } from 'koota';
import { Vec2 } from 'planck';
import { emit, getContext } from '../context';
import { rising } from '../input';
import { shieldBlocks } from './block';
import { hitZoneAt, takeDamage } from './health';
import { weaponByIndex } from '../weapons/defs';
import { Aim, Combat, Controller, Dead, Health, Held, HeldBy, Loose, Player, Snake, Transform, Weapon } from '../traits';

const fighters = createQuery(Player, Combat, Aim, Controller, Transform);

function disarm(world: World, victim: Entity): void {
  const ctx = getContext(world);
  for (const weapon of world.query(Weapon, Held)) {
    if (weapon.targetFor(HeldBy) === victim) {
      const w = weapon.get(Weapon);
      if (w && weaponByIndex(w.defId).id === 'laser') {
        weapon.remove(Held);
        weapon.remove(HeldBy('*'));
        ctx.pendingDestroy.push(weapon);
        continue;
      }
      weapon.remove(Held);
      weapon.add(Loose());
      weapon.remove(HeldBy('*'));
      if (w) weapon.set(Weapon, { ...w, pickupCooldown: ctx.tuning.pickupCooldownTicks, thrown: false });
      const t = victim.get(Transform);
      const body = ctx.bodies.get(weapon);
      if (body && t) {
        body.setActive(true);
        body.setPosition(new Vec2(t.x, t.y + 0.4));
        body.setLinearVelocity(new Vec2((ctx.rng.next() - 0.5) * 4, 4));
      }
    }
  }
}

export function combat(world: World): void {
  const ctx = getContext(world);
  const t = ctx.tuning;

  world.query(fighters).updateEach(([player, combat, aim, _ctrl, transform], entity) => {
    if (entity.has(Dead)) return;
    const input = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
    const prev = ctx.prevInputs[player.inputIndex] ?? ctx.prevInputs[player.slot];
    if (!input) return;
    const body = ctx.bodies.get(entity);
    if (!body) return;

    if (combat.punchCooldown > 0) combat.punchCooldown -= 1;
    if (combat.punchActive > 0) combat.punchActive -= 1;

    const armed = [...world.query(Weapon, Held)].some((w) => w.targetFor(HeldBy) === entity);

    if (input.block && combat.blockMeter > 0) {
      if (!combat.blocking) combat.blockStartTick = ctx.tick;
      combat.blocking = true;
      combat.blockMeter = Math.max(0, combat.blockMeter - 1 / t.blockMeterDrainTicks);
      combat.refillDelay = t.blockMeterRefillDelayTicks;
    } else {
      combat.blocking = false;
      if (combat.refillDelay > 0) combat.refillDelay -= 1;
      else combat.blockMeter = Math.min(1, combat.blockMeter + 1 / t.blockMeterRefillTicks);
    }

    // PLAN 4.7: cannot fire while blocking, but can punch (block-punch jump) even when armed.
    const wantsPunch =
      rising(prev?.attack ?? false, input.attack) &&
      combat.punchCooldown <= 0 &&
      (!armed || combat.blocking);
    if (wantsPunch) {
      combat.punchCooldown = t.punchCooldownTicks;
      combat.punchActive = t.punchActiveTicks;
      const bonus = combat.blocking ? t.blockPunchBonus : 0;
      const impulse = t.punchSelfImpulse + bonus;
      const vel = body.getLinearVelocity();
      // PLAN 2.2: holding down while airborne punching is a punch slam (fast descent).
      const slam = input.down && !_ctrl.grounded ? t.punchSlamImpulse : 0;
      body.setLinearVelocity(new Vec2(vel.x + aim.x * impulse, vel.y + aim.y * impulse - slam));
      const hx = transform.x + aim.x * t.punchRange;
      emit(world, {
        type: 'shot',
        source: entity,
        weaponId: 'fists',
        x: hx,
        y: transform.y + aim.y * t.punchRange,
        aimX: aim.x,
        aimY: aim.y,
      });
      const hy = transform.y + aim.y * t.punchRange;
      const airborne = !_ctrl.grounded;
      const kb = t.punchKnockback * (airborne ? t.dropkickKnockbackScale : 1);
      world.query(Player, Transform, Not(Dead)).updateEach(([_p, otherT], other) => {
        if (other === entity) return;
        const dx = otherT.x - hx;
        const dy = otherT.y - hy;
        if (dx * dx + dy * dy <= t.punchRadius * t.punchRadius) {
          // PLAN 4.7: punches bounce off a shield (no damage / disarm / knockback).
          const block = shieldBlocks(world, other, hx, hy, aim.x, aim.y);
          if (block !== 'none') {
            emit(world, { type: 'block', player: other, reflected: false });
            return;
          }
          const duck = other.get(Controller)?.ducking ?? false;
          const zone = hitZoneAt(hy - otherT.y, t.height, duck);
          takeDamage(world, other, t.punchDamage, zone, entity, otherT.x, otherT.y);
          const otherBody = ctx.bodies.get(other);
          if (otherBody) {
            const ov = otherBody.getLinearVelocity();
            otherBody.setLinearVelocity(
              new Vec2(ov.x + aim.x * kb, ov.y + aim.y * kb + t.punchKnockbackUp),
            );
          }
          disarm(world, other);
        }
      });
      // PLAN 4.14: snakes have HP and take punches (head/neck via hitZoneAt).
      world.query(Snake, Transform, Health).updateEach(([_s, otherT, health], other) => {
        if (health.hp <= 0) return;
        const dx = otherT.x - hx;
        const dy = otherT.y - hy;
        if (dx * dx + dy * dy > t.punchRadius * t.punchRadius) return;
        takeDamage(world, other, t.punchDamage, hitZoneAt(hy - otherT.y, t.height, false), entity, otherT.x, otherT.y);
      });
    }
  });
}

export { disarm };
