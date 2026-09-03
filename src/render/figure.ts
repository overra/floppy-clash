import type { Vec2 } from '../core/math';
import { lerp } from '../core/math';
import { PRIM_CAPSULE, PRIM_DISK, type Primitive } from './sdf/primitives';

export type ArmTip = { x: number; y: number };

export type FigurePose = {
  x: number;
  y: number;
  facing: number;
  ducking: boolean;
  grounded: boolean;
  wallSliding: boolean;
  vx: number;
  vy: number;
  aimX: number;
  aimY: number;
  punching: boolean;
  blocking: boolean;
  dead: boolean;
  phase: number;
  /** When `physicsArms` is on, SDF limbs follow the Planck arm bodies (PLAN 4.6). */
  physicsArmL?: ArmTip;
  physicsArmR?: ArmTip;
};

export type LimbState = {
  hipSway: number;
  shoulderSway: number;
};

export function poseToPrimitives(
  pose: FigurePose,
  secondary: LimbState = { hipSway: 0, shoulderSway: 0 },
): Primitive[] {
  const duck = pose.ducking ? 0.72 : 1;
  const h = 1.8 * duck;
  const headR = 0.18;
  const torsoTop = pose.y + h * 0.28;
  const head = { x: pose.x, y: pose.y + h * 0.42 };
  const hip = {
    x: pose.x + secondary.hipSway + (pose.wallSliding ? -0.12 * pose.facing : 0),
    y: pose.y - h * 0.05,
  };
  const run = pose.grounded && Math.abs(pose.vx) > 0.4 ? Math.sin(pose.phase * 10) : 0;
  const jumping = !pose.grounded && pose.vy > 0.2;
  const falling = !pose.grounded && pose.vy < -0.2;
  const shoulder = { x: pose.x + secondary.shoulderSway, y: torsoTop };
  const aim = { x: pose.aimX, y: pose.aimY };
  const punch = pose.punching ? 0.55 : 0.28;
  const block = pose.blocking ? 0.35 : 0;

  const armL =
    pose.physicsArmL ?? end(shoulder, { x: -0.35 * pose.facing, y: -0.15 + run * 0.1 }, 0.45);
  const armR =
    pose.physicsArmR ??
    end(shoulder, { x: aim.x * punch + block * aim.x, y: aim.y * punch + block * 0.2 }, 0.55);
  const jumpTuck = jumping ? 0.38 : 0;
  const fallSplit = falling ? 0.2 : 0;
  const legLen = jumping ? 0.5 : 0.7;
  const legL = end(hip, { x: -0.15 + run * 0.25 - fallSplit, y: -1 + jumpTuck }, legLen);
  const legR = end(
    hip,
    { x: 0.15 - run * 0.25 + fallSplit, y: -1 + (jumping ? 0.22 : falling ? -0.16 : 0) },
    legLen,
  );

  /** PLAN §4.11: one head disk + 9 capsules (neck, torso, arms, legs, aim hand). */
  const prims: Primitive[] = [
    disk(head, headR),
    cap(shoulder, hip, 0.11),
    cap(shoulder, armL, 0.07),
    cap(shoulder, armR, 0.07),
    cap(hip, { x: lerp(hip.x, legL.x, 0.5), y: lerp(hip.y, legL.y, 0.5) }, 0.08),
    cap({ x: lerp(hip.x, legL.x, 0.5), y: lerp(hip.y, legL.y, 0.5) }, legL, 0.07),
    cap(hip, { x: lerp(hip.x, legR.x, 0.5), y: lerp(hip.y, legR.y, 0.5) }, 0.08),
    cap({ x: lerp(hip.x, legR.x, 0.5), y: lerp(hip.y, legR.y, 0.5) }, legR, 0.07),
    cap(head, shoulder, 0.07),
    cap(armR, { x: armR.x + aim.x * 0.15, y: armR.y + aim.y * 0.15 }, 0.05),
  ];
  return prims.slice(0, 16);
}

export function secondaryFromVelocity(prev: LimbState, vx: number, vy: number): LimbState {
  return {
    hipSway: prev.hipSway * 0.8 + vx * 0.01,
    shoulderSway: prev.shoulderSway * 0.75 - vx * 0.008 + vy * 0.004,
  };
}

function disk(c: Vec2, r: number): Primitive {
  return { kind: PRIM_DISK, ax: c.x, ay: c.y, bx: c.x, by: c.y, r };
}
function cap(a: Vec2, b: Vec2, r: number): Primitive {
  return { kind: PRIM_CAPSULE, ax: a.x, ay: a.y, bx: b.x, by: b.y, r };
}
function end(origin: Vec2, dir: Vec2, len: number): Vec2 {
  const l = Math.hypot(dir.x, dir.y) || 1;
  return { x: origin.x + (dir.x / l) * len, y: origin.y + (dir.y / l) * len };
}
