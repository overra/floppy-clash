import type { PlayerInput } from '../sim/input';
import type { SimHandle } from '../sim/world';

export type Replay = {
  seed: number;
  levelId: string;
  inputs: PlayerInput[][];
};

export function createRecorder(seed: number, levelId: string) {
  const inputs: PlayerInput[][] = [];
  return {
    push(tickInputs: PlayerInput[]) {
      inputs.push(tickInputs.map((i) => ({ ...i })));
    },
    toJSON(): Replay {
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
