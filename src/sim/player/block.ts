import type { Entity, World } from 'koota';
import { getContext } from '../context';
import { Aim, Combat, Transform } from '../traits';

/**
 * PLAN 4.7: shield arc centered on aim. Incoming direction (or the hit point
 * if the attack has no velocity) must sit inside the arc.
 * First `perfectBlockTicks` reflect; later ticks absorb / bounce.
 */
export function shieldBlocks(
  world: World,
  blocker: Entity,
  hx: number,
  hy: number,
  vx: number,
  vy: number,
): 'none' | 'absorb' | 'reflect' {
  const combat = blocker.get(Combat);
  const aim = blocker.get(Aim);
  const t = blocker.get(Transform);
  if (!combat?.blocking || !aim || !t) return 'none';
  const ctx = getContext(world);
  const toHitX = hx - t.x;
  const toHitY = hy - t.y;
  const spd = Math.hypot(vx, vy);
  const toHitLen = Math.hypot(toHitX, toHitY);
  // Point-blank (snake sitting on the blocker) has no incoming vector — honor the shield.
  const fromX = spd > 1e-4 ? -vx : toHitLen > 1e-4 ? toHitX : aim.x;
  const fromY = spd > 1e-4 ? -vy : toHitLen > 1e-4 ? toHitY : aim.y;
  const hitDir = Math.atan2(fromY, fromX);
  const aimDir = Math.atan2(aim.y, aim.x);
  let delta = Math.abs(hitDir - aimDir);
  if (delta > Math.PI) delta = 2 * Math.PI - delta;
  const arc = (ctx.tuning.blockArcDeg * Math.PI) / 180 / 2;
  if (delta > arc) return 'none';
  const inWindow = ctx.tick - combat.blockStartTick <= ctx.tuning.perfectBlockTicks;
  return inWindow ? 'reflect' : 'absorb';
}
