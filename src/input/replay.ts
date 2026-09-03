import type { PlayerInput } from '../sim/input';
import type { SimHandle } from '../sim/world';

export type Replay = {
  seed: number;
  levelId: string;
  inputs: PlayerInput[][];
};

export function createRecorder(seed: number, levelId: string) {
  const inputs: PlayerInput[][] = [];
  let lastBytes = 0;
  let lastName = '';
  return {
    push(tickInputs: PlayerInput[]) {
      inputs.push(tickInputs.map((i) => ({ ...i })));
    },
    toJSON(): Replay {
      return { seed, levelId, inputs };
    },
    lastBytes: () => lastBytes,
    lastName: () => lastName,
    download() {
      const json = JSON.stringify(this.toJSON());
      lastBytes = json.length;
      lastName = `replay-${seed}.json`;
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = lastName;
      a.click();
    },
  };
}

export function parseReplay(raw: string): Replay {
  const parsed = JSON.parse(raw) as Replay;
  if (!Array.isArray(parsed.inputs) || typeof parsed.seed !== 'number') throw new Error('invalid replay');
  return parsed;
}

export type ReplayPlayer = (replay: Replay) => SimHandle;

/** Replay a recorded seed + input tape and return the resulting world hash. */
export function playReplay(replay: Replay, create: ReplayPlayer): { hash: string; ticks: number } {
  const sim = create(replay);
  for (const tickInputs of replay.inputs) {
    sim.step(tickInputs);
  }
  return { hash: sim.hash(), ticks: sim.getTick() };
}
