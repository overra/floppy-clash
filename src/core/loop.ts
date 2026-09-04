export type FixedStepLoop = {
  accumulator: number;
  tickDt: number;
  consume(dtSeconds: number, stepScale?: number): number;
};

/**
 * Most ticks one frame may run to catch up. Two covers a 120 Hz frame that slipped to 30 Hz; more
 * than that and the frame doing the catching up would itself run long.
 */
export const MAX_CATCHUP_STEPS = 2;

export function createFixedStepLoop(tickRate = 60): FixedStepLoop {
  const tickDt = 1 / tickRate;
  return {
    accumulator: 0,
    tickDt,
    consume(dtSeconds: number, stepScale = 1): number {
      this.accumulator += dtSeconds * stepScale;
      let steps = 0;
      while (this.accumulator >= tickDt && steps < MAX_CATCHUP_STEPS) {
        this.accumulator -= tickDt;
        steps += 1;
      }
      // Time still owed past the cap is dropped: after a stall the game resumes at speed instead of
      // running several ticks per frame for a while, which is what turns one long frame into a run.
      if (this.accumulator >= tickDt) this.accumulator = tickDt * 0.5;
      return steps;
    },
  };
}

export function interpolationAlpha(loop: FixedStepLoop): number {
  return loop.accumulator / loop.tickDt;
}
