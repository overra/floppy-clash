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

export function readPad(pad: Gamepad, latch: Latch, lastAim: { x: number; y: number }, map: PadMap = DEFAULT_MAP): PlayerInput {
  const lx = pad.axes[0] ?? 0;
  const ly = pad.axes[1] ?? 0;
  const rx = pad.axes[2] ?? 0;
  const ry = pad.axes[3] ?? 0;
  const move = radialDeadzone(lx, ly, tuning.moveDeadzone);
  const aim = radialDeadzone(rx, -ry, tuning.aimDeadzone);
  const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
  const dpadY = pad.buttons[13]?.pressed;
  const custom = map !== DEFAULT_MAP;
  const jump = custom
    ? !!pad.buttons[map.jump]?.pressed
    : !!(pad.buttons[map.jump]?.pressed || pad.buttons[4]?.pressed);
  const attack = custom
    ? !!pad.buttons[map.attack]?.pressed
    : !!(pad.buttons[map.attack]?.pressed || pad.buttons[5]?.pressed || pad.buttons[2]?.pressed);
  const block = custom
    ? !!pad.buttons[map.block]?.pressed
    : !!(pad.buttons[map.block]?.pressed || pad.buttons[1]?.pressed);
  const thrw = custom
    ? !!pad.buttons[map.throw]?.pressed
    : !!(pad.buttons[map.throw]?.pressed || pad.buttons[2]?.pressed);
  if (jump) latch.jump = true;
  if (attack) latch.attack = true;
  if (block) latch.block = true;
  if (thrw) latch.throw = true;
  if (pad.buttons[map.pause]?.pressed) latch.pause = true;
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

/**
 * Session-unique handle for a controller. Two identical pads report the same `id` string, so
 * seats are keyed by the browser's slot index instead (stable while the pad stays connected).
 */
export function padKey(pad: Pick<Gamepad, 'index'>): string {
  return `pad:${pad.index}`;
}

export function isPadKey(device: string): boolean {
  return device.startsWith('pad:');
}

export function padIndexOf(device: string): number {
  return isPadKey(device) ? Number(device.slice(4)) : -1;
}

/** "DualSense Wireless Controller" out of "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)". */
export function padLabel(pad: Pick<Gamepad, 'id'>): string {
  const short = pad.id.replace(/\s*\(.*$/, '').trim();
  return short || pad.id;
}

/** Rising edges of the buttons menus care about, plus the d-pad / left stick as a repeating digital direction. */
export type PadEdges = {
  a: boolean;
  b: boolean;
  start: boolean;
  select: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type PadEdgeTracker = {
  /** Read the pad once per frame; `now` in ms drives the hold-to-repeat timing. */
  update: (pad: Gamepad, now: number, pauseButton?: number) => PadEdges;
  /** Forget held state (on disconnect), so the next press registers as fresh. */
  reset: () => void;
};

const STICK_ON = 0.6;
const STICK_OFF = 0.35;
const REPEAT_DELAY_MS = 380;
const REPEAT_RATE_MS = 110;

export function createPadEdgeTracker(): PadEdgeTracker {
  const held = { a: false, b: false, start: false, select: false };
  const dir = { x: 0, y: 0 };
  let repeatAt = 0;
  return {
    update(pad, now, pauseButton = 9) {
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const rise = (key: keyof typeof held, down: boolean) => {
        const edge = down && !held[key];
        held[key] = down;
        return edge;
      };
      const a = rise('a', btn(0));
      const b = rise('b', btn(1));
      const start = rise('start', btn(pauseButton) || (pauseButton !== 9 && btn(9)));
      const select = rise('select', btn(8));

      // Digital direction: d-pad wins, otherwise the stick past a threshold with hysteresis so a
      // wobble near the edge does not spam moves.
      const lx = pad.axes[0] ?? 0;
      const ly = pad.axes[1] ?? 0;
      let x = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
      let y = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
      if (x === 0 && y === 0) {
        const mag = Math.hypot(lx, ly);
        const active = mag > STICK_ON || (mag > STICK_OFF && (dir.x !== 0 || dir.y !== 0));
        if (active) {
          if (Math.abs(lx) >= Math.abs(ly)) x = Math.sign(lx);
          else y = Math.sign(ly);
        }
      }
      const changed = x !== dir.x || y !== dir.y;
      let fire = false;
      if (x === 0 && y === 0) {
        fire = false;
      } else if (changed) {
        fire = true;
        repeatAt = now + REPEAT_DELAY_MS;
      } else if (now >= repeatAt) {
        fire = true;
        repeatAt = now + REPEAT_RATE_MS;
      }
      dir.x = x;
      dir.y = y;
      return {
        a,
        b,
        start,
        select,
        up: fire && y < 0,
        down: fire && y > 0,
        left: fire && x < 0,
        right: fire && x > 0,
      };
    },
    reset() {
      held.a = held.b = held.start = held.select = false;
      dir.x = dir.y = 0;
      repeatAt = 0;
    },
  };
}

export function emptyLatch(): Latch {
  return { jump: false, attack: false, block: false, throw: false, pause: false };
}

export function idleInput(): PlayerInput {
  return { ...EMPTY_INPUT };
}
