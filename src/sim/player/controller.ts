import { createQuery, type World } from 'koota';
import { Vec2 } from 'planck';
import { getContext } from '../context';
import { rising } from '../input';
import { raycastClosest, type RayHit } from '../physics/queries';
import { findLedge, grabLedge, stepHang } from './ledge';
import { Aim, Combat, Controller, Dead, Player, Status } from '../traits';

const movers = createQuery(Player, Controller, Aim);

function ignoreMover(self: number, hit: RayHit): boolean {
  if (hit.entity === self) return true;
  // Loose weapons are pickups, not terrain: bodies pass through them, so probes must too.
  if (hit.kind === 'sensor' || hit.kind === 'projectile' || hit.kind === 'weapon') return true;
  return false;
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
    const raw = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
    if (!raw) return;
    // Staggered fighters keep their momentum but cannot steer, jump or duck out of it.
    const stunned = (entity.get(Combat)?.stun ?? 0) > 0;
    const input = stunned ? { ...raw, moveX: 0, jump: false, down: false } : raw;
    const prev = ctx.prevInputs[player.inputIndex] ?? ctx.prevInputs[player.slot];
    const status = entity.get(Status);
    const glued = (status?.glued ?? 0) > 0;
    const slowed = (status?.slowed ?? 0) > 0;
    const bubbled = (status?.bubbled ?? 0) > 0;
    // In a void well's grip the floor gives no purchase: air accel only, and no skidding to a stop.
    const pulled = (status?.pulled ?? 0) > 0;
    // Lugging a forced swinger: no wall-kick.
    const encumbered = (status?.encumbered ?? 0) > 0;
    if (bubbled) return;
    const skip = (h: RayHit) => ignoreMover(entity as unknown as number, h);

    if (ctrl.regrabLock > 0) ctrl.regrabLock -= 1;
    // Holding a ledge replaces ordinary movement until an exit lets go.
    if (ctrl.hangDir !== 0) {
      stepHang(world, entity, ctrl, body, input, prev, skip);
      return;
    }

    const vel = body.getLinearVelocity();
    let vx = vel.x;
    let vy = vel.y;
    const pos = body.getPosition();

    const foot = raycastClosest(world, pos.x, pos.y, pos.x, pos.y - t.height * 0.52 - 0.1, skip);
    ctrl.grounded = !!foot && foot.ny > 0.55;

    // Ledge grab: falling (or cresting) past a lip within the hands' reach, the fighter catches it
    // when pushing toward it, or with any input but down/away when there is no floor to land on
    // (the recovery case). Wall-sliding and the mantle assist cover lips lower down; hitstun, glue
    // and a void well's pull all deny the grab.
    if (!ctrl.grounded && ctrl.regrabLock === 0 && vy <= 3 && !stunned && !glued && !pulled && !input.down) {
      const first = input.moveX > 0.2 ? 1 : input.moveX < -0.2 ? -1 : ctrl.facing;
      const landing = raycastClosest(world, pos.x, pos.y, pos.x, pos.y - t.height / 2 - t.ledgeAutoGrabDrop, skip);
      for (const dir of [first, -first]) {
        const pushing = input.moveX * dir > 0.2;
        if (!pushing && (landing || input.moveX * dir < -0.2)) continue;
        const ledge = findLedge(world, pos, dir, t, skip);
        if (ledge) {
          grabLedge(world, entity, ctrl, body, ledge, dir);
          return;
        }
      }
    }

    // Riding a moving surface: run/decay relative to it, then add its velocity back.
    let carryX = 0;
    let carryY = 0;
    if (ctrl.grounded && foot) {
      const ground = foot.fixture.getBody();
      if (ground.getType() === 'kinematic' || ground.getType() === 'dynamic') {
        const gv = ground.getLinearVelocityFromWorldPoint(new Vec2(foot.x, foot.y));
        carryX = gv.x;
        carryY = gv.y;
      }
    }
    vx -= carryX;

    const leftWall = raycastClosest(world, pos.x, pos.y + 0.15, pos.x - t.wallDetectDistance, pos.y + 0.15, skip);
    const rightWall = raycastClosest(world, pos.x, pos.y + 0.15, pos.x + t.wallDetectDistance, pos.y + 0.15, skip);
    const leftHit = !!leftWall && Math.abs(leftWall.nx) > 0.35;
    const rightHit = !!rightWall && Math.abs(rightWall.nx) > 0.35;

    // Ledge assist: airborne and pushing into a wall whose top is between the feet and the head
    // (with room to stand on it), the fighter scrambles up onto it instead of bumping the lip and
    // sliding back down. It only ever tops up what the jump already has, so a clean jump is untouched.
    const pushDir = input.moveX > 0.2 ? 1 : input.moveX < -0.2 ? -1 : 0;
    const feetY = pos.y - t.height / 2;
    let mantle = false;
    if (!ctrl.grounded && pushDir !== 0 && !input.down && ctrl.lockTicks === 0 && !glued) {
      const probeX = pos.x + pushDir * (t.radius + t.mantleProbe);
      const headY = pos.y + t.height / 2;
      const ledge = raycastClosest(world, probeX, headY + 0.1, probeX, feetY - 0.05, (h) => skip(h) || h.kind === 'player');
      if (ledge && ledge.ny > 0.55) {
        const gap = ledge.y - feetY;
        const room = !raycastClosest(world, probeX, ledge.y + 0.05, probeX, ledge.y + t.height + 0.1, (h) => skip(h) || h.kind === 'player');
        if (gap > 0.1 && gap <= t.mantleReach && room) {
          mantle = true;
          const need = Math.sqrt(2 * t.gravity * (gap + 0.12));
          if (vy < need) vy = need;
          if (vx * pushDir < t.mantleSpeed) vx = pushDir * t.mantleSpeed;
        }
      }
    }

    ctrl.wallDir = 0;
    if (!ctrl.grounded && !mantle) {
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
    if (becameSlide && input.jump && ctrl.lockTicks === 0 && ctrl.jumpBuffer <= 0 && !encumbered) {
      ctrl.jumpBuffer = 1;
    }

    ctrl.ducking = input.down && ctrl.grounded;
    const speed = t.runSpeed * (ctrl.ducking ? t.duckSpeedScale : 1) * (slowed ? 0.45 : 1) * (glued ? 0.15 : 1);
    const accel = (ctrl.grounded && !pulled ? groundAccel : airAccel) * (glued ? 0.2 : 1);

    if (ctrl.lockTicks > 0) {
      ctrl.lockTicks -= 1;
    } else if (Math.abs(input.moveX) > 0.05) {
      const target = input.moveX * speed;
      if (input.moveX > 0 && vx < target) vx = Math.min(target, vx + accel);
      if (input.moveX < 0 && vx > target) vx = Math.max(target, vx - accel);
    } else if (ctrl.grounded && !pulled) {
      // A staggered fighter skids rather than stopping dead, so a blocked swing or clash visibly throws them.
      vx *= stunned ? 0.92 : 0.75;
    }
    // Glue is sticky: it swallows shoves and stalls a jump instead of letting the fighter skate.
    if (glued) {
      vx *= ctrl.grounded ? 0.55 : 0.9;
      if (vy > 0) vy *= 0.6;
    }

    if (ctrl.jumpBuffer > 0 && (ctrl.grounded || ctrl.coyote > 0)) {
      vy = t.jumpSpeed;
      ctrl.jumpBuffer = 0;
      ctrl.coyote = 0;
      ctrl.grounded = false;
    } else if (ctrl.jumpBuffer > 0 && ctrl.wallSliding && !encumbered) {
      vx = -ctrl.wallDir * t.wallJumpX;
      vy = t.wallJumpY;
      ctrl.lockTicks = t.wallJumpLockTicks;
      ctrl.jumpBuffer = 0;
      ctrl.wallSliding = false;
    }

    vy = Math.max(-t.maxFallSpeed, vy);
    vx = Math.max(-t.maxHorizontalSpeed, Math.min(t.maxHorizontalSpeed, vx));
    vx += carryX;
    if (ctrl.grounded && carryY !== 0) vy = Math.max(vy, carryY);
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
