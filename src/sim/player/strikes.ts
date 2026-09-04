import { StrikeKind } from '../traits';
import type { Tuning } from '../tuning';

/** Ticks between throwing a jab and it landing: long enough for two swings to meet, short enough to feel instant. */
export const PUNCH_WINDUP_TICKS = 2;

export type StrikeDef = {
  kind: number;
  /** Ticks from the press to the hit. */
  windup: number;
  /** Ticks the limb stays out after the wind-up. */
  active: number;
  cooldown: number;
  damage: number;
  knockback: number;
  lift: number;
  reach: number;
  radius: number;
  /** Lunge the striker gets on the press, along the aim. */
  selfImpulse: number;
  /** Guard meter a blocked strike takes off the blocker (kicks only). */
  guardDrain: number;
  kick: boolean;
  rear: boolean;
};

export function isKick(kind: number): boolean {
  return kind === StrikeKind.FrontKick || kind === StrikeKind.Roundhouse;
}

export function isRear(kind: number): boolean {
  return kind === StrikeKind.Cross || kind === StrikeKind.Roundhouse;
}

/**
 * Which strike a press produces. Punch and kick are the two buttons; holding the left stick toward
 * the aim (stepping into the target) commits to the rear limb, while standing or backing off keeps
 * the quick lead limb. Aiming straight up or down, "toward" falls back to the way the fighter faces.
 */
export function chooseStrike(kick: boolean, moveX: number, aimX: number, facing = 1): number {
  const forward = Math.abs(aimX) > 0.2 ? Math.sign(aimX) : facing;
  const stepping = moveX * forward > 0.5;
  if (kick) return stepping ? StrikeKind.Roundhouse : StrikeKind.FrontKick;
  return stepping ? StrikeKind.Cross : StrikeKind.Jab;
}

/** The numbers behind a strike. The jab is the original punch, read straight from the punch tuning. */
export function strikeDef(t: Tuning, kind: number): StrikeDef {
  const kick = isKick(kind);
  const rear = isRear(kind);
  const base: StrikeDef = kick
    ? {
        kind,
        windup: t.kickWindupTicks,
        active: t.kickActiveTicks,
        cooldown: t.kickCooldownTicks,
        damage: t.kickDamage,
        knockback: t.kickKnockback,
        lift: t.kickKnockbackUp,
        reach: t.kickRange,
        radius: t.kickRadius,
        selfImpulse: t.kickSelfImpulse,
        guardDrain: t.kickGuardDrain,
        kick,
        rear,
      }
    : {
        kind,
        windup: PUNCH_WINDUP_TICKS,
        active: t.punchActiveTicks,
        cooldown: t.punchCooldownTicks,
        damage: t.punchDamage,
        knockback: t.punchKnockback,
        lift: t.punchKnockbackUp,
        reach: t.punchRange,
        radius: t.punchRadius,
        selfImpulse: t.punchSelfImpulse,
        guardDrain: 0,
        kick,
        rear,
      };
  if (!rear) return base;
  return {
    ...base,
    windup: base.windup + t.rearWindupTicks,
    cooldown: Math.round(base.cooldown * t.rearCooldownScale),
    damage: base.damage * t.rearDamageScale,
    knockback: base.knockback * t.rearKnockbackScale,
    reach: base.reach + t.rearReachBonus,
    selfImpulse: base.selfImpulse * 1.3,
  };
}
