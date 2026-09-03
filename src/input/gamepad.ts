import { clamp } from '../core/math';
import { EMPTY_INPUT, type PlayerInput } from '../sim/input';
import { tuning } from '../sim/tuning';
import { DEFAULT_MAP, type PadMap } from './remap';

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

/** Left-stick memory so PLAN 4.12 stick smoothing can persist across frames. */
export type PadStickMemory = { moveX: number; moveY: number };

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

/** PLAN 4.12: mild exponential stick smoothing (`tuning.stickSmoothing`). */
export function smoothStick(prev: number, next: number, s = tuning.stickSmoothing): number {
  return prev * s + next * (1 - s);
}

/** PLAN 4.12: triggers (and digital buttons) read as down at `triggerThreshold`. */
export function buttonOn(btn: GamepadButton | undefined, threshold = tuning.triggerThreshold): boolean {
  if (!btn) return false;
  return btn.pressed || btn.value >= threshold;
}

export function readPad(
  pad: Gamepad,
  latch: Latch,
  lastAim: { x: number; y: number },
  map: PadMap = DEFAULT_MAP,
  mem?: PadStickMemory,
): PlayerInput {
  const lx = pad.axes[0] ?? 0;
  const ly = pad.axes[1] ?? 0;
  const rx = pad.axes[2] ?? 0;
  const ry = pad.axes[3] ?? 0;
  const move = radialDeadzone(lx, ly, tuning.moveDeadzone);
  const aim = radialDeadzone(rx, -ry, tuning.aimDeadzone);
  let moveX = move.x;
  let moveY = move.y;
  if (mem) {
    moveX = smoothStick(mem.moveX, move.x);
    moveY = smoothStick(mem.moveY, move.y);
    mem.moveX = moveX;
    mem.moveY = moveY;
  }
  const dpadX = (buttonOn(pad.buttons[15]) ? 1 : 0) - (buttonOn(pad.buttons[14]) ? 1 : 0);
  const dpadY = buttonOn(pad.buttons[13]);
  const custom = map !== DEFAULT_MAP;
  // PLAN 4.12: Attack = RT (7) also RB (5). Throw = Y (3) also X/Square (2). X is not Attack.
  const jump = custom
    ? buttonOn(pad.buttons[map.jump])
    : buttonOn(pad.buttons[map.jump]) || buttonOn(pad.buttons[4]);
  const attack = custom
    ? buttonOn(pad.buttons[map.attack])
    : buttonOn(pad.buttons[map.attack]) || buttonOn(pad.buttons[5]);
  const block = custom
    ? buttonOn(pad.buttons[map.block])
    : buttonOn(pad.buttons[map.block]) || buttonOn(pad.buttons[1]);
  const thrw = custom
    ? buttonOn(pad.buttons[map.throw])
    : buttonOn(pad.buttons[map.throw]) || buttonOn(pad.buttons[2]);
  if (jump) latch.jump = true;
  if (attack) latch.attack = true;
  if (block) latch.block = true;
  if (thrw) latch.throw = true;
  if (buttonOn(pad.buttons[map.pause])) latch.pause = true;
  const aimX = Math.abs(aim.x) + Math.abs(aim.y) > 0.01 ? aim.x : lastAim.x;
  const aimY = Math.abs(aim.x) + Math.abs(aim.y) > 0.01 ? aim.y : lastAim.y;
  return {
    moveX: clamp(moveX + dpadX, -1, 1),
    jump: latch.jump,
    down: moveY > tuning.duckStickThreshold || !!dpadY,
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
