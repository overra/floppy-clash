import { EMPTY_INPUT, type PlayerInput } from '../sim/input';
import type { SimHandle } from '../sim/world';

export type Replay = {
  seed: number;
  levelId: string;
  inputs: PlayerInput[][];
};

// Doubles per player per tick: moveX, aimX, aimY, button bits. Values are kept as the doubles the
// sim saw, so a replay reproduces the live hash exactly.
const STRIDE = 4;
const B_JUMP = 1;
const B_DOWN = 2;
const B_ATTACK = 4;
const B_BLOCK = 8;
const B_THROW = 16;
const B_KICK = 32;

/**
 * Records one match's input tape (downloaded with F9, replayed with {@link playReplay}). The tape
 * is a flat, doubling `Float64Array` rather than an array of per-tick objects: a recorder that
 * allocated four objects a tick and kept them for the whole match was the steadiest source of
 * old-generation growth, and with it of the major GC pauses during long games.
 */
export function createRecorder(seed: number, levelId: string) {
  let slots = 0;
  let tape = new Float64Array(0);
  let ticks = 0;
  return {
    push(tickInputs: PlayerInput[]) {
      if (slots === 0) slots = Math.max(1, tickInputs.length);
      const need = (ticks + 1) * slots * STRIDE;
      if (need > tape.length) {
        const grown = new Float64Array(Math.max(need, tape.length * 2, slots * STRIDE * 1024));
        grown.set(tape);
        tape = grown;
      }
      let o = ticks * slots * STRIDE;
      for (let s = 0; s < slots; s++, o += STRIDE) {
        const i = tickInputs[s] ?? EMPTY_INPUT;
        tape[o] = i.moveX;
        tape[o + 1] = i.aimX;
        tape[o + 2] = i.aimY;
        tape[o + 3] =
          (i.jump ? B_JUMP : 0) | (i.down ? B_DOWN : 0) | (i.attack ? B_ATTACK : 0) | (i.block ? B_BLOCK : 0) | (i.throw ? B_THROW : 0) | (i.kick ? B_KICK : 0);
      }
      ticks += 1;
    },
    /** Ticks recorded so far. */
    get length() {
      return ticks;
    },
    toJSON(): Replay {
      const inputs: PlayerInput[][] = [];
      for (let t = 0; t < ticks; t++) {
        const tick: PlayerInput[] = [];
        for (let s = 0; s < slots; s++) {
          const o = (t * slots + s) * STRIDE;
          const bits = tape[o + 3]!;
          tick.push({
            moveX: tape[o]!,
            aimX: tape[o + 1]!,
            aimY: tape[o + 2]!,
            jump: (bits & B_JUMP) !== 0,
            down: (bits & B_DOWN) !== 0,
            attack: (bits & B_ATTACK) !== 0,
            kick: (bits & B_KICK) !== 0,
            block: (bits & B_BLOCK) !== 0,
            throw: (bits & B_THROW) !== 0,
          });
        }
        inputs.push(tick);
      }
      return { seed, levelId, inputs };
    },
    download() {
      const blob = new Blob([JSON.stringify(this.toJSON())], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `replay-${seed}.json`;
      a.click();
    },
  };
}

export type ReplayPlayer = (replay: Replay) => SimHandle;

/** Replay a recorded seed + input tape and return the resulting world hash. */
export function playReplay(replay: Replay, create: ReplayPlayer): { hash: string; ticks: number } {
  const sim = create(replay);
  const start = sim.getTick();
  for (const tickInputs of replay.inputs) {
    sim.step(tickInputs);
  }
  return { hash: sim.hash(), ticks: sim.getTick() - start };
}
