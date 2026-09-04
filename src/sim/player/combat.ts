import { createQuery, Not, type Entity, type World } from 'koota';
import { Vec2 } from 'planck';
import { emit, getContext } from '../context';
import { rising } from '../input';
import { takeDamage } from './health';
import { launchHit } from './knockback';
import { combatAllowed } from '../rules/rounds';
import { Aim, Combat, Controller, Dead, Held, HeldBy, Loose, Player, Transform, Weapon } from '../traits';

const fighters = createQuery(Player, Combat, Aim, Controller, Transform);
const targets = createQuery(Player, Combat, Transform, Not(Dead));

/** Ticks between throwing a punch and it landing: long enough for two swings to meet, short enough to feel instant. */
export const PUNCH_WINDUP_TICKS = 2;
/** Stagger handed to whoever swings into a raised guard, longer when the guard was just raised (perfect block). */
export const BLOCKED_STUN_TICKS = 18;
export const PERFECT_BLOCKED_STUN_TICKS = 30;
/** Both fighters stagger briefly after a clash so neither can immediately follow up. */
export const CLASH_STUN_TICKS = 10;

/**
 * Does the blocker's raised guard cover an attack arriving from (hx, hy)? 'reflect' inside the perfect
 * window that opens when the guard comes up, 'absorb' afterwards, 'none' when not blocking or facing away.
 */
export function shieldBlocks(world: World, blocker: Entity, hx: number, hy: number): 'none' | 'absorb' | 'reflect' {
  const combat = blocker.get(Combat);
  const aim = blocker.get(Aim);
  const t = blocker.get(Transform);
  if (!combat?.blocking || !aim || !t) return 'none';
  const ctx = getContext(world);
  const hitDir = Math.atan2(hy - t.y, hx - t.x);
  const aimDir = Math.atan2(aim.y, aim.x);
  let delta = Math.abs(hitDir - aimDir);
  if (delta > Math.PI) delta = 2 * Math.PI - delta;
  const arc = (ctx.tuning.blockArcDeg * Math.PI) / 180 / 2;
  if (delta > arc) return 'none';
  const inWindow = ctx.tick - combat.blockStartTick <= ctx.tuning.perfectBlockTicks;
  return inWindow ? 'reflect' : 'absorb';
}

function disarm(world: World, victim: Entity): void {
  const ctx = getContext(world);
  for (const weapon of world.query(Weapon, Held)) {
    if (weapon.targetFor(HeldBy) === victim) {
      weapon.remove(Held);
      weapon.add(Loose());
      weapon.remove(HeldBy('*'));
      const w = weapon.get(Weapon);
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

function stagger(world: World, who: Entity, ticks: number, pushX: number, pushY: number): void {
  const ctx = getContext(world);
  const c = who.get(Combat);
  if (c) who.set(Combat, { ...c, stun: Math.max(c.stun, ticks), punchPending: 0, blocking: false });
  const body = ctx.bodies.get(who);
  if (body) {
    const v = body.getLinearVelocity();
    body.setLinearVelocity(new Vec2(v.x * 0.2 + pushX, v.y + pushY));
  }
}

/** The fist's contact point for a fighter mid-swing. */
function fist(world: World, who: Entity): { x: number; y: number } | null {
  const t = who.get(Transform);
  const aim = who.get(Aim);
  if (!t || !aim) return null;
  const reach = getContext(world).tuning.punchRange;
  return { x: t.x + aim.x * reach, y: t.y + aim.y * reach };
}

function resolvePunch(world: World, attacker: Entity): void {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const aim = attacker.get(Aim);
  const at = attacker.get(Transform);
  const hit = fist(world, attacker);
  if (!aim || !at || !hit) return;
  const r2 = t.punchRadius * t.punchRadius;

  // Plain iteration (no updateEach write-back) because the effects below rewrite other fighters' Combat.
  for (const other of [...world.query(targets)]) {
    if (other === attacker) continue;
    const otherT = other.get(Transform);
    const otherCombat = other.get(Combat);
    if (!otherT || !otherCombat) continue;
    const dx = otherT.x - hit.x;
    const dy = otherT.y - hit.y;
    if (dx * dx + dy * dy > r2) continue;

    // Two swings inside the same window cancel out: a clash that knocks both back and stalls both.
    const theirFist = otherCombat.punchPending > 0 ? fist(world, other) : null;
    if (theirFist) {
      const fx = at.x - theirFist.x;
      const fy = at.y - theirFist.y;
      if (fx * fx + fy * fy <= r2) {
        const mx = (at.x + otherT.x) / 2;
        const my = (at.y + otherT.y) / 2 + 0.3;
        const dir = Math.sign(at.x - otherT.x) || 1;
        stagger(world, attacker, CLASH_STUN_TICKS, dir * 5, 2);
        stagger(world, other, CLASH_STUN_TICKS, -dir * 5, 2);
        emit(world, { type: 'clash', x: mx, y: my });
        continue;
      }
    }

    // A raised guard facing the attacker takes the punch and leaves the attacker wide open.
    const guard = shieldBlocks(world, other, at.x, at.y);
    if (guard !== 'none') {
      const perfect = guard === 'reflect';
      emit(world, { type: 'block', player: other, reflected: perfect, x: hit.x, y: hit.y });
      stagger(world, attacker, perfect ? PERFECT_BLOCKED_STUN_TICKS : BLOCKED_STUN_TICKS, -aim.x * 3, 1);
      if (perfect) other.set(Combat, { ...otherCombat, blockMeter: Math.min(1, otherCombat.blockMeter + 0.25) });
      const ob = ctx.bodies.get(other);
      if (ob) {
        const ov = ob.getLinearVelocity();
        ob.setLinearVelocity(new Vec2(ov.x + aim.x * t.punchKnockback * 0.3, ov.y));
      }
      continue;
    }

    takeDamage(world, other, t.punchDamage, 'body', attacker, otherT.x, otherT.y);
    launchHit(world, other, aim.x, aim.y, t.punchKnockback, t.punchKnockbackUp);
    disarm(world, other);
  }
}

export function combat(world: World): void {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const live = combatAllowed(world);

  world.query(fighters).updateEach(([player, combat, aim, , transform], entity) => {
    if (entity.has(Dead)) return;
    const input = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
    const prev = ctx.prevInputs[player.inputIndex] ?? ctx.prevInputs[player.slot];
    if (!input) return;
    const body = ctx.bodies.get(entity);
    if (!body) return;

    if (combat.punchCooldown > 0) combat.punchCooldown -= 1;
    if (combat.punchActive > 0) combat.punchActive -= 1;
    if (combat.stun > 0) combat.stun -= 1;

    // A swing thrown earlier lands now (unless a clash or stagger cancelled it in the meantime).
    if (combat.punchPending > 0) {
      combat.punchPending -= 1;
      if (combat.punchPending === 0) {
        // Write back first so the target sees this fighter as mid-swing when checking for a clash.
        entity.set(Combat, { ...combat });
        resolvePunch(world, entity);
        const after = entity.get(Combat);
        if (after) Object.assign(combat, after);
      }
    }

    const stunned = combat.stun > 0;
    const armed = [...world.query(Weapon, Held)].some((w) => w.targetFor(HeldBy) === entity);

    if (input.block && combat.blockMeter > 0 && !stunned) {
      if (!combat.blocking) combat.blockStartTick = ctx.tick;
      combat.blocking = true;
      combat.blockMeter = Math.max(0, combat.blockMeter - 1 / t.blockMeterDrainTicks);
      combat.refillDelay = t.blockMeterRefillDelayTicks;
    } else {
      combat.blocking = false;
      if (combat.refillDelay > 0) combat.refillDelay -= 1;
      else combat.blockMeter = Math.min(1, combat.blockMeter + 1 / t.blockMeterRefillTicks);
    }

    const wantsPunch = live && !stunned && rising(prev?.attack ?? false, input.attack) && !armed && combat.punchCooldown <= 0;
    if (wantsPunch) {
      combat.punchCooldown = t.punchCooldownTicks;
      combat.punchActive = t.punchActiveTicks;
      combat.punchPending = PUNCH_WINDUP_TICKS;
      const bonus = combat.blocking ? t.blockPunchBonus : 0;
      const impulse = t.punchSelfImpulse + bonus;
      const vel = body.getLinearVelocity();
      body.setLinearVelocity(new Vec2(vel.x + aim.x * impulse, vel.y + aim.y * impulse));
      emit(world, { type: 'punch', player: entity, x: transform.x + aim.x * 0.4, y: transform.y + aim.y * 0.4 + 0.2, aimX: aim.x, aimY: aim.y });
    }
  });
}

export { disarm };
