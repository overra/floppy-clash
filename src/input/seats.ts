import { blankInputs, type PlayerInput } from '../sim/input';

/** PLAN Appendix A: host HP values. */
export const HP_PRESETS = [1, 25, 50, 100, 200] as const;

export type SeatLike = {
  taken: boolean;
  padId: string;
  color: number;
};

export type SeatSpawn = {
  slot: number;
  color: number;
  inputIndex: number;
};

export function seatIndexForPad(seats: SeatLike[], padId: string): number {
  return seats.findIndex((s) => s.taken && s.padId === padId);
}

export function keyboardSeatIndex(seats: SeatLike[]): number {
  return seats.findIndex((s) => s.taken && s.padId === 'keyboard');
}

export function humanSeatAssignments(seats: SeatLike[]): SeatSpawn[] {
  return seats.flatMap((s, i) =>
    s.taken && s.padId && s.padId !== 'bot' ? [{ slot: i, color: s.color, inputIndex: i }] : [],
  );
}

/** Compact couch matches; solo-vs-bots still uses four slots. */
export function matchPlayerCount(seats: SeatLike[], vsBots: boolean): number {
  if (vsBots) return 4;
  const occupied = seats.map((s, i) => (s.taken ? i : -1)).filter((i) => i >= 0);
  if (!occupied.length) return 2;
  return Math.max(2, Math.max(...occupied) + 1);
}

/**
 * PLAN 4.12: pad `id` → joined seat index, not Gamepad API index.
 * Keyboard fills only the keyboard seat (or is omitted).
 */
export function routeSeatInputs(opts: {
  seats: SeatLike[];
  pads: (Gamepad | null)[];
  readPad: (pad: Gamepad, apiIndex: number) => PlayerInput;
  keyboard: PlayerInput | null;
}): PlayerInput[] {
  const inputs = blankInputs(4);
  opts.pads.forEach((pad, apiIndex) => {
    if (!pad) return;
    const seat = seatIndexForPad(opts.seats, pad.id);
    if (seat < 0) return;
    inputs[seat] = opts.readPad(pad, apiIndex);
  });
  const kb = keyboardSeatIndex(opts.seats);
  if (kb >= 0 && opts.keyboard) inputs[kb] = opts.keyboard;
  return inputs;
}

/** Online / editor / no join seats: one local device drives slot 0. */
export function samplePrimaryLocal(opts: {
  pads: (Gamepad | null)[];
  padInput: (pad: Gamepad) => PlayerInput;
  keyboard: PlayerInput;
}): PlayerInput {
  const pad = opts.pads.find((p): p is Gamepad => Boolean(p));
  if (pad) return opts.padInput(pad);
  return opts.keyboard;
}

/**
 * PLAN 4.12: any pad can pause; the pausing pad or seat 1 resumes.
 * `actor === '*'` is the on-screen Resume button.
 */
export function canResumePause(actor: string, pausedBy: string | null, seats: SeatLike[]): boolean {
  if (pausedBy == null) return true;
  if (actor === '*') return true;
  if (actor === pausedBy) return true;
  const seat1 = seats[0];
  if (!seat1?.taken || seat1.padId === 'bot') return false;
  return actor === seat1.padId;
}

/**
 * PLAN 4.12 Start/Options is a rising edge: hold must not pause then immediately resume.
 * `wasDown` is the previous sample; `isDown` is this frame (latched or live).
 */
export function pauseRisingEdge(wasDown: boolean, isDown: boolean): boolean {
  return isDown && !wasDown;
}

/**
 * PLAN 4.12: a Start that is already down when play begins must not pause.
 * Seed each held-flag from the current down sample (join, editor playtest, or Start).
 */
export function seedHeldFromDown(held: boolean[], down: boolean[]): void {
  const n = Math.max(held.length, down.length);
  for (let i = 0; i < n; i++) {
    held[i] = Boolean(down[i]);
  }
}
