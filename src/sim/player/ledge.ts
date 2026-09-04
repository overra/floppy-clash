import type { Entity, World } from 'koota';
import { Vec2, type Body } from 'planck';
import { emit, getContext } from '../context';
import type { PlayerInput } from '../input';
import { rising } from '../input';
import { raycastClosest, type RayHit } from '../physics/queries';
import { isLaunch } from '../rules/mode';
import { Combat, Status } from '../traits';
import type { Tuning } from '../tuning';

/** The capsule hangs with its top level with the lip: the head just below the ledge, hands on it. */
export const HANG_DROP = 0.9;

export type Ledge = { lipX: number; lipY: number; wallX: number };

type Ctrl = {
  grounded: boolean;
  wallDir: number;
  coyote: number;
  jumpBuffer: number;
  lockTicks: number;
  ducking: boolean;
  facing: number;
  wallSliding: boolean;
  vx: number;
  vy: number;
  hangDir: number;
  hangTicks: number;
  regrabLock: number;
};

/**
 * Is there a ledge on side `dir` of a fighter at `pos` that the hands can catch? The lip must be a
 * walkable top (normal up) between ledgeGrabLow and ledgeGrabHigh above the body centre, backed by a
 * wall face at hand height, with nothing above the fighter's head: a lip you are under is a ceiling.
 */
export function findLedge(world: World, pos: { x: number; y: number }, dir: number, t: Tuning, skip: (h: RayHit) => boolean): Ledge | null {
  const probeX = pos.x + dir * (t.radius + t.mantleProbe);
  const top = pos.y + t.ledgeGrabHigh;
  const bottom = pos.y + t.ledgeGrabLow;
  const lip = raycastClosest(world, probeX, top + 0.05, probeX, bottom, (h) => skip(h) || h.kind === 'player');
  if (!lip || lip.ny <= 0.55) return null;
  const handY = lip.y - 0.25;
  const wall = raycastClosest(world, pos.x, handY, pos.x + dir * (t.radius + t.mantleProbe + 0.2), handY, (h) => skip(h) || h.kind === 'player');
  if (!wall || Math.abs(wall.nx) <= 0.35) return null;
  // Under something: no grab (the lip belongs to a surface over the fighter's head).
  const overhead = raycastClosest(world, pos.x, pos.y, pos.x, pos.y + t.height / 2 + 0.3, (h) => skip(h) || h.kind === 'player');
  if (overhead) return null;
  return { lipX: lip.x, lipY: lip.y, wallX: wall.x };
}

/** Where the body centre sits while holding a ledge. */
export function hangPosition(ledge: Ledge, dir: number, t: Tuning): { x: number; y: number } {
  return { x: ledge.wallX - dir * (t.radius + 0.02), y: ledge.lipY - HANG_DROP };
}

export function grabLedge(world: World, entity: Entity, ctrl: Ctrl, body: Body, ledge: Ledge, dir: number): void {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const at = hangPosition(ledge, dir, t);
  body.setPosition(new Vec2(at.x, at.y));
  body.setLinearVelocity(new Vec2(0, 0));
  body.setGravityScale(0);
  body.setAwake(true);
  ctrl.hangDir = dir;
  ctrl.hangTicks = 0;
  ctrl.wallDir = 0;
  ctrl.wallSliding = false;
  ctrl.ducking = false;
  ctrl.grounded = false;
  ctrl.coyote = 0;
  ctrl.jumpBuffer = 0;
  ctrl.lockTicks = 0;
  ctrl.vx = 0;
  ctrl.vy = 0;
  ctrl.facing = dir;
  // Launch mode: a moment of immunity on the grab, so an edge-guard has to be timed, not spammed.
  if (isLaunch(world)) {
    const status = entity.get(Status);
    if (status) entity.set(Status, { invuln: Math.max(status.invuln, t.ledgeInvulnTicks) });
  }
  emit(world, { type: 'ledge', player: entity, x: ledge.lipX, y: ledge.lipY });
}

function release(ctrl: Ctrl, body: Body, t: Tuning, vx: number, vy: number, lock: boolean): void {
  body.setGravityScale(1);
  body.setLinearVelocity(new Vec2(vx, vy));
  ctrl.vx = vx;
  ctrl.vy = vy;
  ctrl.hangDir = 0;
  ctrl.hangTicks = 0;
  if (lock) ctrl.regrabLock = t.regrabLockTicks;
}

/**
 * One tick of hanging. Holds the body against the lip (re-found every tick, so a moving platform
 * carries its hanger), then reads the exits: jump hops up and slightly onto the stage, the stick
 * toward the ledge (or a strike) climbs, down or away lets go, and a stagger, a lost lip or the hang
 * cap drop the fighter. Returns true when the fighter is still hanging afterwards.
 */
export function stepHang(
  world: World,
  entity: Entity,
  ctrl: Ctrl,
  body: Body,
  input: PlayerInput,
  prev: PlayerInput | undefined,
  skip: (h: RayHit) => boolean,
): boolean {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const dir = ctrl.hangDir;
  const pos = body.getPosition();
  ctrl.hangTicks += 1;
  ctrl.facing = dir;
  ctrl.grounded = false;

  const stunned = (entity.get(Combat)?.stun ?? 0) > 0;
  if (stunned) {
    // Knocked off: keep whatever the hit gave us.
    const v = body.getLinearVelocity();
    release(ctrl, body, t, v.x, v.y, true);
    return false;
  }

  // The lip may have moved (platform) or gone (collapsed): find it again from where we hang.
  const ledge = findLedge(world, { x: pos.x, y: pos.y - 0.2 }, dir, t, skip) ?? findLedge(world, { x: pos.x, y: pos.y + 0.2 }, dir, t, skip);
  if (!ledge || ctrl.hangTicks > t.maxHangTicks) {
    release(ctrl, body, t, 0, -1, true);
    return false;
  }
  const at = hangPosition(ledge, dir, t);
  const dt = 1 / t.tickRate;
  // Steer onto the hold point rather than teleport, so a moving lip reads as carrying the fighter.
  const hx = Math.max(-20, Math.min(20, (at.x - pos.x) / dt));
  const hy = Math.max(-20, Math.min(20, (at.y - pos.y) / dt));
  body.setLinearVelocity(new Vec2(hx, hy));
  body.setAwake(true);
  ctrl.vx = 0;
  ctrl.vy = 0;

  const settled = ctrl.hangTicks > t.hangGraceTicks;
  const feetY = at.y - t.height / 2;
  const rise = ledge.lipY - feetY;
  const climbSpeed = Math.sqrt(2 * t.gravity * Math.min(rise, t.ledgeGrabMaxRise) + 0.12);

  if (rising(prev?.jump ?? false, input.jump)) {
    release(ctrl, body, t, dir * t.ledgeJumpX, t.jumpSpeed, true);
    ctrl.lockTicks = 2;
    return false;
  }
  const strike = rising(prev?.attack ?? false, input.attack) || rising(prev?.kick ?? false, input.kick);
  if (strike || (settled && input.moveX * dir > 0.5)) {
    // Climb: the mantle's arc, carried onto the lip; a strike on the way up is the get-up attack
    // (the combat system sees the same press this tick).
    release(ctrl, body, t, dir * t.mantleSpeed, climbSpeed, true);
    ctrl.regrabLock = Math.min(ctrl.regrabLock, 12);
    return false;
  }
  if (settled && (input.down || input.moveX * dir < -0.5)) {
    release(ctrl, body, t, -dir * 0.5, -1, true);
    return false;
  }
  return true;
}
