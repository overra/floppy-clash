import { createQuery, Not, type Entity, type World } from 'koota';
import { Vec2 } from 'planck';
import { emit, getContext } from '../context';
import { rising } from '../input';
import { takeDamage } from './health';
import { launchHit } from './knockback';
import { chooseStrike, isKick, PUNCH_WINDUP_TICKS, strikeDef, type StrikeDef } from './strikes';
import { combatAllowed } from '../rules/rounds';
import { Aim, Combat, Controller, Dead, Held, HeldBy, Loose, Player, StrikeKind, Transform, Weapon } from '../traits';

const fighters = createQuery(Player, Combat, Aim, Controller, Transform);
const targets = createQuery(Player, Combat, Transform, Not(Dead));

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
  if (c) who.set(Combat, { ...c, stun: Math.max(c.stun, ticks), strikePending: 0, blocking: false });
  const body = ctx.bodies.get(who);
  if (body) {
    const v = body.getLinearVelocity();
    body.setLinearVelocity(new Vec2(v.x * 0.2 + pushX, v.y + pushY));
  }
}

/** The contact point of a fighter's strike in flight (fist or foot), along the aim at the strike's reach. */
function strikePoint(world: World, who: Entity, kind: number): { x: number; y: number } | null {
  const t = who.get(Transform);
  const aim = who.get(Aim);
  if (!t || !aim) return null;
  const reach = strikeDef(getContext(world).tuning, kind || StrikeKind.Jab).reach;
  return { x: t.x + aim.x * reach, y: t.y + aim.y * reach };
}

/**
 * Does a strike from `from` out to `tip` touch a fighter centred at (px, py)? The limb is a capsule
 * of `radius` along that segment, so a target inside the reach is hit as surely as one at the tip
 * (a lunging kick would otherwise pass its foot clean over a point-blank opponent).
 */
function strikeTouches(from: { x: number; y: number }, tip: { x: number; y: number }, radius: number, px: number, py: number): boolean {
  const sx = tip.x - from.x;
  const sy = tip.y - from.y;
  const len2 = sx * sx + sy * sy || 1;
  const u = Math.max(0, Math.min(1, ((px - from.x) * sx + (py - from.y) * sy) / len2));
  const dx = px - (from.x + sx * u);
  const dy = py - (from.y + sy * u);
  return dx * dx + dy * dy <= radius * radius;
}

function resolveStrike(world: World, attacker: Entity, def: StrikeDef): void {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const aim = attacker.get(Aim);
  const at = attacker.get(Transform);
  const hit = strikePoint(world, attacker, def.kind);
  if (!aim || !at || !hit) return;

  // Plain iteration (no updateEach write-back) because the effects below rewrite other fighters' Combat.
  for (const other of [...world.query(targets)]) {
    if (other === attacker) continue;
    const otherT = other.get(Transform);
    const otherCombat = other.get(Combat);
    if (!otherT || !otherCombat) continue;
    if (!strikeTouches(at, hit, def.radius, otherT.x, otherT.y)) continue;

    // Two strikes inside the same window cancel out: a clash that knocks both back and stalls both.
    const theirs = otherCombat.strikePending > 0 ? strikePoint(world, other, otherCombat.strike) : null;
    if (theirs) {
      const theirR = strikeDef(t, otherCombat.strike || StrikeKind.Jab).radius;
      if (strikeTouches(otherT, theirs, theirR, at.x, at.y)) {
        const mx = (at.x + otherT.x) / 2;
        const my = (at.y + otherT.y) / 2 + 0.3;
        const dir = Math.sign(at.x - otherT.x) || 1;
        stagger(world, attacker, CLASH_STUN_TICKS, dir * 5, 2);
        stagger(world, other, CLASH_STUN_TICKS, -dir * 5, 2);
        emit(world, { type: 'clash', x: mx, y: my });
        continue;
      }
    }

    // A raised guard facing the attacker takes the strike. A perfect block stops anything and leaves
    // the attacker wide open. Against a settled guard a punch bounces off and staggers the puncher,
    // while a kick leans on the guard: it drains the meter, breaks it when it runs dry, and only
    // briefly stalls the kicker.
    const guard = shieldBlocks(world, other, at.x, at.y);
    if (guard !== 'none') {
      const perfect = guard === 'reflect';
      if (perfect) {
        emit(world, { type: 'block', player: other, reflected: true, x: hit.x, y: hit.y });
        stagger(world, attacker, PERFECT_BLOCKED_STUN_TICKS, -aim.x * 3, 1);
        other.set(Combat, { ...otherCombat, blockMeter: Math.min(1, otherCombat.blockMeter + 0.25) });
        continue;
      }
      if (def.kick) {
        const meter = otherCombat.blockMeter - def.guardDrain;
        if (meter <= 0) {
          // Guard break: the blocker is knocked open and staggered, though spared the damage.
          emit(world, { type: 'block', player: other, reflected: false, x: hit.x, y: hit.y });
          emit(world, { type: 'clash', x: hit.x, y: hit.y });
          stagger(world, other, t.guardBreakStunTicks, aim.x * 2, 1);
          const broken = other.get(Combat);
          if (broken) other.set(Combat, { ...broken, blockMeter: 0, refillDelay: t.blockMeterRefillDelayTicks * 2 });
          launchHit(world, other, aim.x, aim.y, def.knockback * 0.5, def.lift * 0.5);
        } else {
          emit(world, { type: 'block', player: other, reflected: false, x: hit.x, y: hit.y });
          other.set(Combat, { ...otherCombat, blockMeter: meter });
          stagger(world, attacker, Math.round(BLOCKED_STUN_TICKS / 2), -aim.x * 2, 0.5);
          launchHit(world, other, aim.x, aim.y, def.knockback * 0.5);
        }
        continue;
      }
      emit(world, { type: 'block', player: other, reflected: false, x: hit.x, y: hit.y });
      stagger(world, attacker, BLOCKED_STUN_TICKS, -aim.x * 3, 1);
      const ob = ctx.bodies.get(other);
      if (ob) {
        const ov = ob.getLinearVelocity();
        ob.setLinearVelocity(new Vec2(ov.x + aim.x * t.punchKnockback * 0.3, ov.y));
      }
      continue;
    }

    takeDamage(world, other, def.damage, 'body', attacker, otherT.x, otherT.y);
    launchHit(world, other, aim.x, aim.y, def.knockback, def.lift);
    disarm(world, other);
  }
}

export function combat(world: World): void {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const live = combatAllowed(world);

  world.query(fighters).updateEach(([player, combat, aim, ctrl, transform], entity) => {
    if (entity.has(Dead)) return;
    const input = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
    const prev = ctx.prevInputs[player.inputIndex] ?? ctx.prevInputs[player.slot];
    if (!input) return;
    const body = ctx.bodies.get(entity);
    if (!body) return;

    if (combat.strikeCooldown > 0) combat.strikeCooldown -= 1;
    if (combat.strikeActive > 0) combat.strikeActive -= 1;
    if (combat.stun > 0) combat.stun -= 1;

    // A strike thrown earlier lands now (unless a clash or stagger cancelled it in the meantime).
    if (combat.strikePending > 0) {
      combat.strikePending -= 1;
      if (combat.strikePending === 0) {
        // Write back first so the target sees this fighter as mid-swing when checking for a clash.
        entity.set(Combat, { ...combat });
        resolveStrike(world, entity, strikeDef(t, combat.strike || StrikeKind.Jab));
        const after = entity.get(Combat);
        if (after) Object.assign(combat, after);
      }
    }
    if (combat.strikeActive === 0 && combat.strikePending === 0) combat.strike = StrikeKind.None;

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

    const ready = live && !stunned && !armed && combat.strikeCooldown <= 0;
    const wantsKick = ready && rising(prev?.kick ?? false, input.kick);
    const wantsPunch = ready && !wantsKick && rising(prev?.attack ?? false, input.attack);
    if (wantsKick || wantsPunch) {
      const def = strikeDef(t, chooseStrike(wantsKick, input.moveX, aim.x, ctrl.facing));
      combat.strike = def.kind;
      combat.strikeCooldown = def.cooldown;
      // The jab is shown for punchActiveTicks from the press (its wind-up included), exactly as the
      // original punch was; longer strikes add their extra wind-up on top.
      combat.strikeActive = def.windup - PUNCH_WINDUP_TICKS + def.active;
      combat.strikePending = def.windup;
      // The block-punch bonus is the punch-jump movement tech; kicks lunge on their own number.
      const bonus = combat.blocking && !def.kick ? t.blockPunchBonus : 0;
      const impulse = def.selfImpulse + bonus;
      const vel = body.getLinearVelocity();
      body.setLinearVelocity(new Vec2(vel.x + aim.x * impulse, vel.y + aim.y * impulse));
      emit(world, {
        type: 'punch',
        player: entity,
        kick: isKick(def.kind),
        x: transform.x + aim.x * 0.4,
        y: transform.y + aim.y * 0.4 + 0.2,
        aimX: aim.x,
        aimY: aim.y,
      });
    }
  });
}

export { disarm };
