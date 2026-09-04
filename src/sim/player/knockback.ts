import type { Entity, World } from 'koota';
import { Vec2 } from 'planck';
import { getContext } from '../context';
import { isLaunch } from '../rules/mode';
import { Combat, Health, Player, Status } from '../traits';

/** How much harder a fighter flies than at 0%: always 1 outside launch mode. */
export function knockbackScale(world: World, target: Entity): number {
  if (!isLaunch(world)) return 1;
  const t = getContext(world).tuning;
  const percent = target.get(Health)?.percent ?? 0;
  return Math.min(t.launchMaxScale, t.launchBaseScale + (percent / 100) * t.launchPercentScale);
}

/** True while the target shrugs off hits and shoves (respawn immunity, ledge immunity). */
export function isInvulnerable(target: Entity): boolean {
  return (target.get(Status)?.invuln ?? 0) > 0;
}

/**
 * The one place a hit moves a fighter. (ux, uy) is the unit launch direction, `amount` the shove
 * along it in m/s and `lift` a straight-up extra. Standing mode is a plain velocity add, written in
 * the same order as the original per-weapon code so its results are bit-identical. Launch mode
 * scales the whole shove with the victim's percent, lets the victim's stick bend the angle (DI)
 * and turns the launch speed into hitstun.
 */
export function launchHit(world: World, target: Entity, ux: number, uy: number, amount: number, lift = 0): void {
  const ctx = getContext(world);
  const body = ctx.bodies.get(target);
  if (!body) return;
  if (isInvulnerable(target)) return;
  const v = body.getLinearVelocity();
  if (!isLaunch(world)) {
    body.setLinearVelocity(new Vec2(v.x + ux * amount, v.y + uy * amount + lift));
    return;
  }
  const t = ctx.tuning;
  const scale = knockbackScale(world, target);
  let kx = ux * amount * scale;
  let ky = (uy * amount + lift) * scale;
  const speed = Math.hypot(kx, ky);
  if (speed > 1e-6) {
    const player = target.get(Player);
    const input = player ? ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot] : undefined;
    if (input) {
      // DI: the stick's component perpendicular to the launch bends it, up to diMaxDeg either way.
      const px = -ky / speed;
      const py = kx / speed;
      const influence = Math.max(-1, Math.min(1, input.moveX * px + (input.down ? -1 : 0) * py));
      const angle = (influence * t.diMaxDeg * Math.PI) / 180;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const rx = kx * c - ky * s;
      const ry = kx * s + ky * c;
      kx = rx;
      ky = ry;
    }
    const combat = target.get(Combat);
    if (combat) {
      const stun = Math.min(t.hitstunMaxTicks, Math.round(speed * t.hitstunPerSpeed));
      if (stun > combat.stun) target.set(Combat, { stun, punchPending: 0, blocking: false });
    }
  }
  body.setLinearVelocity(new Vec2(v.x + kx, v.y + ky));
}
