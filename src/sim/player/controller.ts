import { createQuery, type World } from 'koota';
import { Vec2 } from 'planck';
import { authoredHalfWidth } from '../authored';
import { emit, getContext } from '../context';
import { rising } from '../input';
import { raycastClosest, type RayHit } from '../physics/queries';
import { Aim, Controller, Dead, Hazard, HazardKind, Player, Status, Transform } from '../traits';

const movers = createQuery(Player, Controller, Aim);

function ignoreMover(self: number, hit: RayHit): boolean {
  if (hit.entity === self) return true;
  if (hit.kind === 'sensor' || hit.kind === 'projectile') return true;
  return false;
}

function iceUnderfoot(world: World, x: number, y: number): boolean {
  let ice = false;
  world.query(Hazard, Transform).updateEach(([hz, t]) => {
    if (hz.kind !== HazardKind.Ice) return;
    // param0 is authored ice width. 0 means no look-ahead — do not `|| 3`.
    const hw = authoredHalfWidth(hz.param0);
    if (Math.abs(t.x - x) < hw + 0.5 && Math.abs(t.y - y) < 2.8) ice = true;
  });
  return ice;
}

export function controller(world: World): void {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const groundAccel = t.runSpeed / t.groundAccelTicks;
  const airAccel = t.runSpeed / t.airAccelTicks;

  world.query(movers).updateEach(([player, ctrl, aim], entity) => {
    if (entity.has(Dead)) return;
    const body = ctx.bodies.get(entity);
    if (!body) return;
    const input = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
    if (!input) return;
    const prev = ctx.prevInputs[player.inputIndex] ?? ctx.prevInputs[player.slot];
    const status = entity.get(Status);
    const glued = (status?.glued ?? 0) > 0;
    const slowed = (status?.slowed ?? 0) > 0;
    const bubbled = (status?.bubbled ?? 0) > 0;
    if (bubbled) {
      body.setGravityScale(0);
      body.setLinearVelocity(new Vec2(0, 0));
      ctrl.vx = 0;
      ctrl.vy = 0;
      return;
    }
    if (body.getGravityScale() !== 1) body.setGravityScale(1);

    const vel = body.getLinearVelocity();
    let vx = vel.x;
    let vy = vel.y;
    const pos = body.getPosition();
    const skip = (h: RayHit) => ignoreMover(entity as unknown as number, h);

    const foot = raycastClosest(world, pos.x, pos.y, pos.x, pos.y - t.height * 0.52 - 0.1, skip);
    ctrl.grounded = !!foot && foot.ny > 0.55;

    const leftWall = raycastClosest(world, pos.x, pos.y + 0.15, pos.x - t.wallDetectDistance, pos.y + 0.15, skip);
    const rightWall = raycastClosest(world, pos.x, pos.y + 0.15, pos.x + t.wallDetectDistance, pos.y + 0.15, skip);
    const leftHit = !!leftWall && Math.abs(leftWall.nx) > 0.35;
    const rightHit = !!rightWall && Math.abs(rightWall.nx) > 0.35;

    ctrl.wallDir = 0;
    if (!ctrl.grounded) {
      if (leftHit && input.moveX < -0.2) ctrl.wallDir = -1;
      if (rightHit && input.moveX > 0.2) ctrl.wallDir = 1;
    }
    const wantSlide = ctrl.wallDir !== 0;
    const becameSlide = wantSlide && !ctrl.wallSliding;
    ctrl.wallSliding = wantSlide;
    if (ctrl.wallSliding && vy < -t.wallSlideMaxFall) vy = -t.wallSlideMaxFall;

    if (ctrl.grounded) ctrl.coyote = t.coyoteTicks;
    else if (ctrl.coyote > 0) ctrl.coyote -= 1;

    if (rising(prev?.jump ?? false, input.jump)) ctrl.jumpBuffer = t.jumpBufferTicks;
    else if (ctrl.jumpBuffer > 0) ctrl.jumpBuffer -= 1;

    // One held-jump wall-jump per new slide contact (climbing).
    if (becameSlide && input.jump && ctrl.lockTicks === 0 && ctrl.jumpBuffer <= 0) {
      ctrl.jumpBuffer = 1;
    }

    ctrl.ducking = input.down && ctrl.grounded;
    const speed = t.runSpeed * (ctrl.ducking ? t.duckSpeedScale : 1) * (slowed ? 0.45 : 1) * (glued ? 0.15 : 1);
    const accel = (ctrl.grounded ? groundAccel : airAccel) * (glued ? 0.2 : 1);

    if (glued) {
      // PLAN Appendix C glue gun: pins the player in place.
      vx = 0;
    } else if (ctrl.lockTicks > 0) {
      ctrl.lockTicks -= 1;
    } else if (Math.abs(input.moveX) > 0.05) {
      const target = input.moveX * speed;
      if (input.moveX > 0 && vx < target) vx = Math.min(target, vx + accel);
      if (input.moveX < 0 && vx > target) vx = Math.max(target, vx - accel);
    } else if (ctrl.grounded) {
      const onIce =
        ctx.onIce.has(entity as unknown as number) || iceUnderfoot(world, pos.x, pos.y);
      if (onIce) vx *= 0.992;
      else vx *= ctrl.ducking ? 0.45 : 0.75;
    }

    if (ctrl.jumpBuffer > 0 && (ctrl.grounded || ctrl.coyote > 0)) {
      vy = t.jumpSpeed;
      ctrl.jumpBuffer = 0;
      ctrl.coyote = 0;
      ctrl.grounded = false;
      emit(world, { type: 'jump', player: player.slot });
    } else if (ctrl.jumpBuffer > 0 && ctrl.wallSliding) {
      vx = -ctrl.wallDir * t.wallJumpX;
      vy = t.wallJumpY;
      ctrl.lockTicks = t.wallJumpLockTicks;
      ctrl.jumpBuffer = 0;
      ctrl.wallSliding = false;
      emit(world, { type: 'jump', player: player.slot });
    }

    vy = Math.max(-t.maxFallSpeed, vy);
    vx = Math.max(-t.maxHorizontalSpeed, Math.min(t.maxHorizontalSpeed, vx));
    body.setLinearVelocity(new Vec2(vx, vy));
    ctrl.vx = vx;
    ctrl.vy = vy;
    if (Math.abs(input.moveX) > 0.15 && !ctrl.ducking) {
      ctrl.facing = input.moveX > 0 ? 1 : -1;
    } else if (Math.abs(aim.x) > 0.2) {
      ctrl.facing = aim.x >= 0 ? 1 : -1;
    }
  });
}
