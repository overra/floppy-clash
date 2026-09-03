import { clamp } from '../core/math';
import { EMPTY_INPUT, type PlayerInput } from '../sim/input';
import { tuning } from '../sim/tuning';

export type PadSeat = {
  index: number;
  id: string;
  slot: number;
  mapping: string;
};

export type Latch = {
  jump: boolean;
  attack: boolean;
  block: boolean;
  throw: boolean;
  pause: boolean;
};

export type GamepadSample = {
  pads: (Gamepad | null)[];
  seats: PadSeat[];
};

export function radialDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag < dz) return { x: 0, y: 0 };
  const scale = (mag - dz) / (1 - dz);
  return { x: (x / mag) * scale, y: (y / mag) * scale };
}

export function readPad(pad: Gamepad, latch: Latch, lastAim: { x: number; y: number }): PlayerInput {
  const lx = pad.axes[0] ?? 0;
  const ly = pad.axes[1] ?? 0;
  const rx = pad.axes[2] ?? 0;
  const ry = pad.axes[3] ?? 0;
  const move = radialDeadzone(lx, ly, tuning.moveDeadzone);
  const aim = radialDeadzone(rx, -ry, tuning.aimDeadzone);
  const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
  const dpadY = pad.buttons[13]?.pressed;
  const jump = !!(pad.buttons[0]?.pressed || pad.buttons[4]?.pressed);
  const attack = !!(pad.buttons[7]?.pressed || pad.buttons[5]?.pressed || (pad.buttons[2]?.pressed ?? false));
  const block = !!(pad.buttons[6]?.pressed || pad.buttons[1]?.pressed);
  const thrw = !!(pad.buttons[3]?.pressed || pad.buttons[2]?.pressed);
  if (jump) latch.jump = true;
  if (attack) latch.attack = true;
  if (block) latch.block = true;
  if (thrw) latch.throw = true;
  if (pad.buttons[9]?.pressed) latch.pause = true;
  const aimX = Math.abs(aim.x) + Math.abs(aim.y) > 0.01 ? aim.x : lastAim.x;
  const aimY = Math.abs(aim.x) + Math.abs(aim.y) > 0.01 ? aim.y : lastAim.y;
  return {
    moveX: clamp(move.x + dpadX, -1, 1),
    jump: latch.jump,
    down: move.y > tuning.duckStickThreshold || !!dpadY,
    attack: latch.attack,
    block: latch.block,
    throw: latch.throw,
    aimX,
    aimY,
  };
}

export function consumeLatch(latch: Latch): Latch {
  latch.jump = false;
  latch.attack = false;
  latch.block = false;
  latch.throw = false;
  return latch;
}

export function pollGamepads(): (Gamepad | null)[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return [...navigator.getGamepads()];
}

export function emptyLatch(): Latch {
  return { jump: false, attack: false, block: false, throw: false, pause: false };
}

export function idleInput(): PlayerInput {
  return { ...EMPTY_INPUT };
}
