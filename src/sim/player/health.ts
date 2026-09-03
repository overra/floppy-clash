import type { Entity, World } from 'koota';
import { emit, getContext } from '../context';
import { Dead, Health } from '../traits';
import type { HitZone } from '../events';

export function hitZoneAt(localY: number, height: number, ducking: boolean): HitZone {
  // PLAN 4.6 / 4.7: ducking shortens the pose and lowers the head/neck bands.
  const poseH = ducking ? height * 0.7 : height;
  const topY = poseH / 2;
  const fromTop = topY - localY;
  if (fromTop < 0) return 'body';
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
  const health = target.get(Health);
  if (!health) return 0;
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
