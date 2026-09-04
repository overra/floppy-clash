import type { Vec2 } from '../core/math';
import { PRIM_CAPSULE, PRIM_DISK, type Primitive } from './sdf/primitives';

/**
 * Procedural stick figure (PLAN 4.6 / 4.11). Limbs are cosmetic while alive: the sim owns one
 * capsule, this module turns its state into a pose. Everything is in meters around the capsule
 * center (x, y); the figure is 1.8 m tall with feet at y - 0.9.
 */
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
  /** A kick is out: the striking foot goes along the aim (chambered at the hip while `strikeWindup`). */
  kicking?: boolean;
  /** Rear-limb strike (cross / roundhouse): the trailing hand or foot does the work. */
  strikeRear?: boolean;
  /** Still winding up: the limb is cocked, not yet extended. */
  strikeWindup?: boolean;
  /** Hanging from a ledge on side `hangDir`: arms up to the lip, legs dangling. */
  hanging?: boolean;
  hangDir?: number;
  blocking: boolean;
  dead: boolean;
  phase: number;
  /** Held weapon, if any: arm(s) extend along aim and the hand anchors the weapon. */
  weapon?: { length: number; twoHanded: boolean } | null;
  wallDir?: number;
  /** Ticks since the figure was hit (for the flinch), 0 when not recently hit. */
  hurt?: number;
};

/**
 * A loose joint: a spring-damped offset (body-local metres) from wherever the pose wants the part.
 * `tx/ty` remember the last target so a target that teleports (a pose change, a turn) becomes an
 * offset the spring works off, and the part visibly travels instead of snapping.
 */
export type Spring = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; live: boolean };

export type LimbState = {
  hipSway: number;
  shoulderSway: number;
  /** 0–1 landing squash, decays every frame. */
  squash: number;
  wasGrounded: boolean;
  /** Smoothed run-cycle phase so animation speed follows the actual velocity. */
  runPhase: number;
  /** Eye blink timer (seconds until next blink; negative while blinking). */
  blink: number;
  /** Body velocity last frame, and this frame's change in it: the jolt that flops the limbs. */
  lastVx: number;
  lastVy: number;
  kickX: number;
  kickY: number;
  /** Frame time this state was advanced by (the springs integrate over it). */
  dt: number;
  torso: Spring;
  head: Spring;
  handMain: Spring;
  handOff: Spring;
  footL: Spring;
  footR: Spring;
};

export type FigureBuild = {
  /** Body silhouette (head + limbs) — one smooth-union group in the player color. */
  body: Primitive[];
  /** Eyes, drawn flat in a dark ink color on top of the body. */
  eyes: Primitive[];
  /** Main hand (aim / weapon hand) and off hand in world space. */
  handMain: Vec2;
  handOff: Vec2;
  /** Weapon anchor: the hand position plus the aim angle (radians), mirrored when aiming left. */
  weaponAnchor: { x: number; y: number; angle: number; flip: boolean };
  head: { x: number; y: number; r: number };
};

export const FIGURE = {
  // Chibi proportions: the head is ~40% of the height, the torso is a chunky slab and the limbs
  // are short and thick, so a figure stays readable at the zoom levels a 4-player arena needs.
  height: 1.8,
  headR: 0.36,
  torsoR: 0.17,
  armR: 0.11,
  legR: 0.12,
  handR: 0.12,
  upperArm: 0.3,
  foreArm: 0.3,
  thigh: 0.34,
  shin: 0.34,
  smoothK: 0.06,
} as const;

function spring(): Spring {
  return { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, live: false };
}

export function emptyLimbState(): LimbState {
  return {
    hipSway: 0,
    shoulderSway: 0,
    squash: 0,
    wasGrounded: true,
    runPhase: 0,
    blink: 2.5,
    lastVx: 0,
    lastVy: 0,
    kickX: 0,
    kickY: 0,
    dt: 1 / 60,
    torso: spring(),
    head: spring(),
    handMain: spring(),
    handOff: spring(),
    footL: spring(),
    footR: spring(),
  };
}

export function secondaryFromVelocity(prev: LimbState, vx: number, vy: number, grounded = true, dt = 1 / 60): LimbState {
  const landed = grounded && !prev.wasGrounded;
  const squash = landed ? Math.min(1, 0.4 + Math.min(1, Math.abs(vy) / 18) * 0.6) : prev.squash * 0.78;
  const speed = Math.abs(vx);
  const runPhase = prev.runPhase + (grounded && speed > 0.4 ? Math.max(6, speed * 1.6) * dt : 0);
  let blink = prev.blink - dt;
  if (blink < -0.12) blink = 2 + Math.random() * 3.5;
  // A frame that is not a sim tick repeats the velocity: no jolt. A stall (tab hidden) is capped so
  // the figure does not explode on return.
  const step = Math.min(dt, 0.05);
  return {
    ...prev,
    hipSway: prev.hipSway * 0.8 + vx * 0.01,
    shoulderSway: prev.shoulderSway * 0.75 - vx * 0.008 + vy * 0.004,
    squash,
    wasGrounded: grounded,
    runPhase,
    blink,
    lastVx: vx,
    lastVy: vy,
    kickX: clamp(vx - prev.lastVx, -20, 20),
    kickY: clamp(vy - prev.lastVy, -20, 20),
    dt: step,
  };
}

/** How loose a joint is: natural frequency (rad/s), damping ratio, jolt gain and max travel (m). */
type Looseness = { omega: number; zeta: number; jolt: number; max: number };
const LOOSE: Looseness = { omega: 16, zeta: 0.28, jolt: 0.32, max: 0.34 };
const SWINGING: Looseness = { omega: 24, zeta: 0.4, jolt: 0.26, max: 0.3 };
const FIRM: Looseness = { omega: 40, zeta: 0.75, jolt: 0.1, max: 0.12 };
const PLANTED: Looseness = { omega: 42, zeta: 0.85, jolt: 0.04, max: 0.08 };
const DANGLING: Looseness = { omega: 13, zeta: 0.3, jolt: 0.24, max: 0.3 };
const BOBBLE: Looseness = { omega: 17, zeta: 0.3, jolt: 0.1, max: 0.12 };
const SWAY: Looseness = { omega: 14, zeta: 0.32, jolt: 0.06, max: 0.12 };

/**
 * Advance a loose joint toward its target (body-local) and return where it actually is. The
 * offset absorbs any change in the target, gets kicked by the body's velocity change, then
 * relaxes as a damped spring (semi-implicit Euler, substepped so stiff joints stay stable).
 */
function settle(s: Spring, tx: number, ty: number, k: Looseness, sec: LimbState, kickScale = 1): Vec2 {
  if (!s.live) {
    s.tx = tx;
    s.ty = ty;
    s.live = true;
  }
  s.x += s.tx - tx;
  s.y += s.ty - ty;
  s.tx = tx;
  s.ty = ty;
  s.vx -= sec.kickX * k.jolt * kickScale;
  s.vy -= sec.kickY * k.jolt * kickScale;
  const steps = Math.max(1, Math.ceil(sec.dt / (1 / 120)));
  const h = sec.dt / steps;
  const stiff = k.omega * k.omega;
  const damp = 2 * k.zeta * k.omega;
  for (let i = 0; i < steps; i++) {
    s.vx += (-stiff * s.x - damp * s.vx) * h;
    s.vy += (-stiff * s.y - damp * s.vy) * h;
    s.x += s.vx * h;
    s.y += s.vy * h;
  }
  const m = Math.hypot(s.x, s.y);
  if (m > k.max) {
    const f = k.max / m;
    s.x *= f;
    s.y *= f;
    s.vx *= f;
    s.vy *= f;
  }
  return { x: tx + s.x, y: ty + s.y };
}

export function buildFigure(pose: FigurePose, sec: LimbState = emptyLimbState()): FigureBuild {
  const F = FIGURE;
  const facing = pose.facing >= 0 ? 1 : -1;
  const feetY = pose.y - F.height / 2;
  const aimLen = Math.hypot(pose.aimX, pose.aimY) || 1;
  const aim = { x: pose.aimX / aimLen, y: pose.aimY / aimLen };
  const aimAngle = Math.atan2(aim.y, aim.x);
  const aimSide = aim.x >= 0 ? 1 : -1;
  const hurt = Math.max(0, pose.hurt ?? 0);
  const flinch = hurt > 0 ? Math.min(1, hurt / 8) : 0;

  // Vertical stack, compressed when ducking and squashed on landing (scaled about the feet).
  const duck = pose.ducking ? 0.6 : 1;
  const squashY = 1 - sec.squash * 0.16;
  const stretchY = pose.hanging ? 1.06 : !pose.grounded && pose.vy > 4 ? 1.04 : 1;
  const scaleY = duck * squashY * stretchY;
  const lift = (h: number) => feetY + h * scaleY;
  // Leg reach is 0.68, so a 0.64 hip keeps idle knees nearly straight instead of half-squatting.
  const hipH = 0.64;
  const shoulderH = 1.06;
  const headH = 1.42;
  const leanX = clamp(pose.vx * 0.014, -0.16, 0.16) * (pose.grounded ? 1 : 0.5) + sec.shoulderSway * 0.5 - flinch * 0.12 * aimSide;
  const slideOffset = pose.wallSliding ? -0.12 * facing : 0;

  // Loose joints work in body-local space so moving with the body costs nothing; only jolts (the
  // body's velocity changing) and pose changes set them swinging.
  const local = (p: Vec2): Vec2 => ({ x: p.x - pose.x, y: p.y - pose.y });
  const world = (p: Vec2): Vec2 => ({ x: p.x + pose.x, y: p.y + pose.y });
  const loose = (s: Spring, target: Vec2, k: Looseness, kickScale = 1): Vec2 => {
    const t = local(target);
    return world(settle(s, t.x, t.y, k, sec, kickScale));
  };

  const hip = { x: pose.x + sec.hipSway * 0.6 + slideOffset, y: lift(hipH) };
  // The torso whips a little after the hips, and the head bobbles after the torso.
  const shoulder = loose(sec.torso, { x: pose.x + leanX + slideOffset * 0.6, y: lift(shoulderH) }, SWAY);
  const torsoLag = { x: shoulder.x - (pose.x + leanX + slideOffset * 0.6), y: shoulder.y - lift(shoulderH) };
  const headTarget = { x: pose.x + leanX * 1.5 + slideOffset * 0.3 + torsoLag.x * 1.4, y: lift(headH) + (pose.ducking ? 0.06 : 0) + torsoLag.y };
  const head = loose(sec.head, headTarget, BOBBLE);

  // Legs
  const run = pose.grounded && Math.abs(pose.vx) > 0.4 ? sec.runPhase : 0;
  const stride = clamp(Math.abs(pose.vx) / 8, 0, 1);
  let footL: Vec2;
  let footR: Vec2;
  let kneeDirL = facing;
  let kneeDirR = facing;
  if (pose.hanging) {
    // Dangling from the lip: legs hang a little away from the wall, one bent, knees toward it.
    const wall = pose.hangDir ?? facing;
    footL = { x: pose.x - wall * 0.12, y: feetY + 0.14 };
    footR = { x: pose.x - wall * 0.02, y: feetY + 0.04 };
    kneeDirL = wall;
    kneeDirR = wall;
  } else if (pose.kicking) {
    // The striking foot chambers at the hip through the wind-up, then snaps out along the aim. A
    // front kick uses the leading foot; a roundhouse swings the trailing one through. The other foot
    // plants a touch behind the hips (or trails when airborne).
    const legLen = F.thigh + F.shin;
    const strike: Vec2 = pose.strikeWindup
      ? { x: hip.x + aimSide * 0.1, y: hip.y - 0.22 }
      : { x: hip.x + aim.x * legLen * 0.98, y: hip.y + aim.y * legLen * 0.98 };
    const plant: Vec2 = pose.grounded ? { x: pose.x - aimSide * 0.14, y: feetY } : { x: pose.x - aimSide * 0.2, y: feetY + 0.06 };
    // footL sits at -x in the idle stance, so it trails when the strike goes right.
    const rearIsL = aimSide > 0;
    const strikeIsL = pose.strikeRear ? rearIsL : !rearIsL;
    footL = strikeIsL ? strike : plant;
    footR = strikeIsL ? plant : strike;
    kneeDirL = facing;
    kneeDirR = facing;
  } else if (pose.ducking) {
    footL = { x: pose.x - 0.3, y: feetY };
    footR = { x: pose.x + 0.3, y: feetY };
    kneeDirL = -1;
    kneeDirR = 1;
  } else if (pose.wallSliding) {
    const wall = pose.wallDir ?? facing;
    footL = { x: pose.x + wall * 0.2, y: feetY + 0.1 };
    footR = { x: pose.x + wall * 0.08, y: feetY + 0.26 };
    kneeDirL = -wall;
    kneeDirR = -wall;
  } else if (!pose.grounded) {
    if (pose.vy > 1.5) {
      // rising: tuck
      footL = { x: pose.x + facing * 0.16, y: feetY + 0.28 };
      footR = { x: pose.x - facing * 0.1, y: feetY + 0.14 };
    } else {
      // falling: legs trail, slightly spread
      footL = { x: pose.x + facing * 0.24, y: feetY + 0.08 };
      footR = { x: pose.x - facing * 0.2, y: feetY + 0.02 };
    }
  } else if (run !== 0) {
    const s = Math.sin(run);
    const c = Math.cos(run);
    // The foot swinging forward (positive derivative of its x) is the one in the air.
    footL = { x: pose.x + facing * s * 0.36 * stride, y: feetY + Math.max(0, c) * 0.2 * stride };
    footR = { x: pose.x - facing * s * 0.36 * stride, y: feetY + Math.max(0, -c) * 0.2 * stride };
  } else {
    footL = { x: pose.x - 0.16 + Math.sin(pose.phase * 2) * 0.005, y: feetY };
    footR = { x: pose.x + 0.16, y: feetY };
    kneeDirL = facing;
    kneeDirR = facing;
  }
  // Feet plant firmly on the ground but dangle in the air; a planted foot never sinks into the floor.
  // A kicking foot tracks its target firmly so the kick reads as a snap, not a swing.
  const legReach = F.thigh + F.shin;
  const footK = pose.kicking ? FIRM : pose.grounded ? PLANTED : DANGLING;
  footL = clampReach(hip, loose(sec.footL, footL, footK), legReach);
  footR = clampReach(hip, loose(sec.footR, footR, footK, 0.8), legReach);
  if (pose.grounded && !pose.wallSliding && !pose.kicking) {
    footL.y = Math.max(footL.y, feetY);
    footR.y = Math.max(footR.y, feetY);
  }
  const kneeL = solveJoint(hip, footL, F.thigh, F.shin, kneeDirL);
  const kneeR = solveJoint(hip, footR, F.thigh, F.shin, kneeDirR);

  // Arms
  const holding = !!pose.weapon;
  let handMain: Vec2;
  let handOff: Vec2;
  let elbowDirMain = -aimSide;
  let elbowDirOff = -aimSide;
  const reach = F.upperArm + F.foreArm;
  if (pose.dead) {
    handMain = { x: shoulder.x + 0.2, y: shoulder.y - 0.5 };
    handOff = { x: shoulder.x - 0.2, y: shoulder.y - 0.5 };
  } else if (pose.hanging) {
    // Both hands up on the lip (the capsule top sits level with it), elbows out from the wall.
    const wall = pose.hangDir ?? facing;
    const lipY = pose.y + F.height / 2;
    handMain = { x: pose.x + wall * (F.torsoR + 0.24), y: lipY + 0.04 };
    handOff = { x: pose.x + wall * (F.torsoR + 0.1), y: lipY - 0.02 };
    elbowDirMain = -wall;
    elbowDirOff = -wall;
  } else if (pose.blocking) {
    const perp = { x: -aim.y, y: aim.x };
    handMain = { x: shoulder.x + aim.x * 0.42 + perp.x * 0.14, y: shoulder.y + aim.y * 0.42 + perp.y * 0.14 };
    handOff = { x: shoulder.x + aim.x * 0.38 - perp.x * 0.14, y: shoulder.y + aim.y * 0.38 - perp.y * 0.14 };
    elbowDirMain = -aimSide;
    elbowDirOff = aimSide;
  } else if (pose.punching && pose.strikeRear) {
    // Cross: the trailing hand drives through while the lead hand tucks back; cocked during the wind-up.
    const ext = pose.strikeWindup ? -0.3 : 0.62 + 0.05;
    handOff = { x: shoulder.x + aim.x * ext, y: shoulder.y + aim.y * ext + (pose.strikeWindup ? 0.05 : 0) };
    handMain = { x: shoulder.x + aim.x * 0.18, y: shoulder.y + 0.12 };
    elbowDirMain = -aimSide;
    elbowDirOff = aimSide;
  } else if (pose.punching) {
    const ext = 0.62 + 0.05;
    handMain = { x: shoulder.x + aim.x * ext, y: shoulder.y + aim.y * ext };
    handOff = { x: shoulder.x - aim.x * 0.22, y: shoulder.y - 0.28 };
    elbowDirOff = aimSide;
  } else if (pose.kicking) {
    // Guard up and a counterbalancing arm back while the leg works.
    handMain = { x: shoulder.x + aim.x * 0.26, y: shoulder.y + 0.14 };
    handOff = { x: shoulder.x - aim.x * 0.3, y: shoulder.y - 0.1 };
    elbowDirMain = -aimSide;
    elbowDirOff = aimSide;
  } else if (holding) {
    const w = pose.weapon!;
    const ext = w.twoHanded ? 0.52 : 0.58;
    handMain = { x: shoulder.x + aim.x * ext, y: shoulder.y + aim.y * ext };
    if (w.twoHanded) {
      const perp = { x: -aim.y, y: aim.x };
      const fwd = Math.min(reach * 0.98, ext + Math.min(0.32, w.length * 0.45));
      handOff = { x: shoulder.x + aim.x * fwd - perp.x * 0.06 * aimSide, y: shoulder.y + aim.y * fwd - perp.y * 0.06 * aimSide };
      elbowDirOff = aimSide;
    } else {
      handOff = idleHand(shoulder, -facing, run, stride, pose);
      elbowDirOff = -facing;
    }
  } else if (pose.wallSliding) {
    const wall = pose.wallDir ?? facing;
    handMain = { x: pose.x + wall * 0.36, y: shoulder.y + 0.26 };
    handOff = { x: shoulder.x - wall * 0.18, y: shoulder.y - 0.45 };
    elbowDirMain = -wall;
    elbowDirOff = wall;
  } else if (!pose.grounded) {
    // airborne: arms out to the sides (clear of the big head), higher while falling
    const up = pose.vy > 1.5;
    handMain = { x: shoulder.x + facing * 0.5, y: shoulder.y + (up ? 0.12 : 0.26) };
    handOff = { x: shoulder.x - facing * 0.5, y: shoulder.y + (up ? 0.04 : 0.22) };
    elbowDirMain = facing;
    elbowDirOff = -facing;
  } else {
    handMain = idleHand(shoulder, facing, run, stride, pose);
    handOff = idleHand(shoulder, -facing, run + Math.PI, stride, pose);
    // hanging arms: elbows point backward so forearms swing forward
    elbowDirMain = -facing;
    elbowDirOff = -facing;
  }
  // Arms hang off the torso's edges, main arm on the aim side.
  const striking = pose.punching || !!pose.kicking;
  const armSide = pose.hanging
    ? pose.hangDir ?? facing
    : pose.dead || pose.wallSliding || (!pose.grounded && !holding && !striking && !pose.blocking)
      ? facing
      : aimSide;
  const shoulderMain = { x: shoulder.x + armSide * F.torsoR * 0.7, y: shoulder.y + 0.02 };
  const shoulderOff = { x: shoulder.x - armSide * F.torsoR * 0.7, y: shoulder.y + 0.02 };
  // A hand with a job (gun, fist, guard) tracks its target firmly so the weapon points where the
  // sim aims; free hands swing loose, trailing jumps and flopping on landings.
  const busyMain = holding || striking || pose.blocking || !!pose.hanging;
  const busyOff = (holding && pose.weapon!.twoHanded) || pose.blocking || (pose.punching && !!pose.strikeRear) || !!pose.kicking || !!pose.hanging;
  const freeK = !pose.grounded ? LOOSE : run !== 0 ? SWINGING : LOOSE;
  handMain = clampReach(shoulderMain, loose(sec.handMain, handMain, busyMain ? FIRM : freeK), reach);
  handOff = clampReach(shoulderOff, loose(sec.handOff, handOff, busyOff ? FIRM : freeK, 1.15), reach);
  const elbowMain = solveJoint(shoulderMain, handMain, F.upperArm, F.foreArm, elbowDirMain, true);
  const elbowOff = solveJoint(shoulderOff, handOff, F.upperArm, F.foreArm, elbowDirOff, true);

  const body: Primitive[] = [
    disk(head, F.headR),
    cap(shoulder, hip, F.torsoR),
    cap(hip, kneeL, F.legR),
    cap(kneeL, footL, F.legR * 0.92),
    cap(hip, kneeR, F.legR),
    cap(kneeR, footR, F.legR * 0.92),
    cap(shoulderOff, elbowOff, F.armR),
    cap(elbowOff, handOff, F.armR * 0.95),
    cap(shoulderMain, elbowMain, F.armR),
    cap(elbowMain, handMain, F.armR * 0.95),
    disk(handMain, F.handR * (pose.punching && !pose.strikeRear ? 1.25 : 1)),
    disk(handOff, F.handR * (pose.punching && pose.strikeRear ? 1.2 : 0.9)),
    disk(footL, F.legR * 1.05),
    disk(footR, F.legR * 1.05),
  ];

  // Eyes look along the aim (or facing); blink briefly; close when dead.
  const lookX = pose.dead ? facing * 0.4 : clamp(aim.x, -1, 1);
  const lookY = pose.dead ? -0.2 : clamp(aim.y, -0.7, 0.7);
  const ex = head.x + lookX * 0.14;
  const ey = head.y + 0.02 + lookY * 0.1;
  const eyeR = 0.052;
  const spread = 0.1 * (1 - Math.abs(lookX) * 0.25);
  const blinking = sec.blink < 0 || pose.dead;
  const squint = hurt > 0 ? 0.6 : 1;
  const eyes: Primitive[] = blinking
    ? [
        { kind: PRIM_CAPSULE, ax: ex - spread - 0.03, ay: ey, bx: ex - spread + 0.03, by: ey, r: 0.02 },
        { kind: PRIM_CAPSULE, ax: ex + spread - 0.03, ay: ey, bx: ex + spread + 0.03, by: ey, r: 0.02 },
      ]
    : [
        { kind: PRIM_DISK, ax: ex - spread, ay: ey, bx: ex - spread, by: ey, r: eyeR * squint },
        { kind: PRIM_DISK, ax: ex + spread, ay: ey, bx: ex + spread, by: ey, r: eyeR * squint },
      ];

  return {
    body,
    eyes,
    handMain,
    handOff,
    weaponAnchor: { x: handMain.x, y: handMain.y, angle: aimAngle, flip: aim.x < 0 },
    head: { x: head.x, y: head.y, r: F.headR },
  };
}

/** Legacy accessor used by tests and the debug view: body primitives only. */
export function poseToPrimitives(pose: FigurePose, secondary: Partial<LimbState> = {}): Primitive[] {
  return buildFigure(pose, { ...emptyLimbState(), ...secondary }).body.slice(0, 16);
}

function idleHand(shoulder: Vec2, side: number, run: number, stride: number, pose: FigurePose): Vec2 {
  if (run !== 0) {
    const swing = Math.sin(run) * 0.28 * stride;
    return { x: shoulder.x + side * 0.12 + swing * side, y: shoulder.y - 0.42 + Math.abs(swing) * 0.4 };
  }
  const bob = Math.sin(pose.phase * 2) * 0.01;
  return { x: shoulder.x + side * 0.3, y: shoulder.y - 0.54 + bob };
}

/**
 * Two-bone IK: joint position for a limb from `a` to `b` with segment lengths l1/l2.
 * `dir` picks the bend side (+1 bends toward +x for vertical limbs; for arms the bend goes
 * along the perpendicular of the shoulder→hand direction).
 */
function solveJoint(a: Vec2, b: Vec2, l1: number, l2: number, dir: number, arm = false): Vec2 {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 1e-3;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  if (d < 1e-4) return { x: a.x + l1 * 0.5, y: a.y - l1 * 0.5 };
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const ang = Math.acos(cosA);
  const base = Math.atan2(dy, dx);
  // Perpendicular choice: legs bend so the knee points along `dir` (x axis); arms bend so the elbow
  // sits on the `dir` side of the shoulder→hand line, which reads as "elbow out".
  let side: number;
  if (arm) side = dir >= 0 ? 1 : -1;
  else side = (dir >= 0 ? 1 : -1) * (dy <= 0 ? 1 : -1);
  const jointAng = base + side * ang;
  return { x: a.x + Math.cos(jointAng) * l1, y: a.y + Math.sin(jointAng) * l1 };
}

function clampReach(origin: Vec2, target: Vec2, reach: number): Vec2 {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d <= reach) return target;
  return { x: origin.x + (dx / d) * reach, y: origin.y + (dy / d) * reach };
}

function disk(c: Vec2, r: number): Primitive {
  return { kind: PRIM_DISK, ax: c.x, ay: c.y, bx: c.x, by: c.y, r };
}
function cap(a: Vec2, b: Vec2, r: number): Primitive {
  return { kind: PRIM_CAPSULE, ax: a.x, ay: a.y, bx: b.x, by: b.y, r };
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
