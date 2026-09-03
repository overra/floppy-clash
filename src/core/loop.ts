export type FixedStepLoop = {
  accumulator: number;
  tickDt: number;
  consume(dtSeconds: number, stepScale: number): number;
};

export function createFixedStepLoop(tickRate = 60): FixedStepLoop {
  const tickDt = 1 / tickRate;
  return {
    accumulator: 0,
    tickDt,
    consume(dtSeconds: number, stepScale = 1): number {
      this.accumulator += dtSeconds * stepScale;
      let steps = 0;
      const maxSteps = 8;
      while (this.accumulator >= tickDt && steps < maxSteps) {
        this.accumulator -= tickDt;
        steps += 1;
      }
      return steps;
    },
  };
}

export function interpolationAlpha(loop: FixedStepLoop): number {
  return loop.accumulator / loop.tickDt;
}
