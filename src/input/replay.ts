import type { PlayerInput } from '../sim/input';

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
