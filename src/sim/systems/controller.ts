import { createQuery, type World } from 'koota';
import { Vec2 } from 'planck';
import { getContext } from '../context';
import { rising } from '../input';
import { raycastClosest } from '../physics/queries';
import { Aim, Controller, Dead, Player, Status } from '../traits';

const movers = createQuery(Player, Controller, Aim);

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
    if (bubbled) return;

    const vel = body.getLinearVelocity();
    let vx = vel.x;
    let vy = vel.y;
    const pos = body.getPosition();

    const leftWall = raycastClosest(world, pos.x, pos.y, pos.x - t.wallDetectDistance, pos.y, (h) => h.entity === entity);
    const rightWall = raycastClosest(world, pos.x, pos.y, pos.x + t.wallDetectDistance, pos.y, (h) => h.entity === entity);
    const ground = raycastClosest(world, pos.x, pos.y - t.height * 0.35, pos.x, pos.y - t.height * 0.55, (h) => h.entity === entity);
    ctrl.grounded = !!ground && (ground.ny > 0.4 || pos.y > ground.y);
    if (!ctrl.grounded && Math.abs(vy) < 0.4 && ground) ctrl.grounded = true;

    ctrl.wallDir = 0;
    if (!ctrl.grounded) {
      if (leftWall && input.moveX < -0.2) ctrl.wallDir = -1;
      if (rightWall && input.moveX > 0.2) ctrl.wallDir = 1;
    }
    ctrl.wallSliding = ctrl.wallDir !== 0;
    if (ctrl.wallSliding && vy < -t.wallSlideMaxFall) vy = -t.wallSlideMaxFall;

    if (ctrl.grounded) ctrl.coyote = t.coyoteTicks;
    else if (ctrl.coyote > 0) ctrl.coyote -= 1;

    if (rising(prev?.jump ?? false, input.jump)) ctrl.jumpBuffer = t.jumpBufferTicks;
    else if (ctrl.jumpBuffer > 0) ctrl.jumpBuffer -= 1;

    ctrl.ducking = input.down && ctrl.grounded;
    const speed = t.runSpeed * (ctrl.ducking ? t.duckSpeedScale : 1) * (slowed ? 0.45 : 1) * (glued ? 0.15 : 1);
    const accel = (ctrl.grounded ? groundAccel : airAccel) * (glued ? 0.2 : 1);

    if (ctrl.lockTicks > 0) {
      ctrl.lockTicks -= 1;
    } else if (Math.abs(input.moveX) > 0.05) {
      const target = input.moveX * speed;
      if (input.moveX > 0 && vx < target) vx = Math.min(target, vx + accel);
      if (input.moveX < 0 && vx > target) vx = Math.max(target, vx - accel);
    } else if (ctrl.grounded && !glued) {
      vx *= 0.75;
    }

    if (ctrl.jumpBuffer > 0 && (ctrl.grounded || ctrl.coyote > 0)) {
      vy = t.jumpSpeed;
      ctrl.jumpBuffer = 0;
      ctrl.coyote = 0;
      ctrl.grounded = false;
    } else if (ctrl.jumpBuffer > 0 && ctrl.wallSliding) {
      vx = -ctrl.wallDir * t.wallJumpX;
      vy = t.wallJumpY;
      ctrl.lockTicks = t.wallJumpLockTicks;
      ctrl.jumpBuffer = 0;
      ctrl.wallSliding = false;
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
