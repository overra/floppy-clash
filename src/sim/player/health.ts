import type { Entity, World } from 'koota';
import { emit, getContext } from '../context';
import { isLaunch } from '../rules/mode';
import { combatAllowed } from '../rules/rounds';
import { Dead, Health } from '../traits';
import type { HitZone } from '../events';
import { isInvulnerable } from './knockback';

export function hitZoneAt(localY: number, height: number, ducking: boolean): HitZone {
  const top = ducking ? height * 0.7 : height;
  const fromTop = top / 2 - localY;
  if (fromTop <= 0.45) return 'head';
  if (fromTop <= 0.6) return 'neck';
  return 'body';
}

export function damageMultiplier(zone: HitZone, world: World): number {
  const t = getContext(world).tuning;
  if (zone === 'head') return t.headshotMult;
  if (zone === 'neck') return t.neckMult;
  return 1;
}

/**
 * Hurts a fighter. Standing mode drains hp and kills at zero. Launch mode piles the damage onto
 * `percent` instead and leaves hp alone: nothing short of the blast zone (or an instant hazard)
 * finishes a fighter there. Instant kills ignore the countdown and any immunity.
 */
export function takeDamage(
  world: World,
  target: Entity,
  amount: number,
  zone: HitZone,
  source: number,
  x: number,
  y: number,
  instant = false,
): number {
  if (target.has(Dead)) return 0;
  // Out-of-bounds (instant) kills always apply; everything else waits for the round to be live.
  if (!instant && !combatAllowed(world)) return 0;
  if (!instant && isInvulnerable(target)) return 0;
  const health = target.get(Health);
  if (!health) return 0;
  if (!instant && isLaunch(world)) {
    const applied = amount * damageMultiplier(zone, world);
    target.set(Health, { percent: health.percent + applied });
    emit(world, { type: 'hit', source, target, damage: applied, zone, x, y });
    emit(world, { type: 'blood', x, y, amount: applied });
    return applied;
  }
  const applied = instant ? health.hp : amount * damageMultiplier(zone, world);
  const next = instant ? 0 : Math.max(0, health.hp - applied);
  target.set(Health, { hp: next, maxHp: health.maxHp });
  emit(world, { type: 'hit', source, target, damage: applied, zone, x, y });
  emit(world, { type: 'blood', x, y, amount: applied });
  if (next <= 0) {
    emit(world, { type: 'kill', source, target, x, y });
  }
  return applied;
}
