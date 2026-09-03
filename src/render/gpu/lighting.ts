/**
 * Optional 2D lighting (M5 stretch). `@typegpu/radiance-cascades` is behind a settings
 * toggle and a GPU-time budget. When the package is not available or the budget is
 * exceeded the pass is a no-op and the SDF renderer still draws.
 */
export type LightingOpts = {
  enabled: boolean;
  budgetMs: number;
};

export function lightingEnabled(opts: LightingOpts, lastGpuMs: number): boolean {
  return opts.enabled && lastGpuMs < opts.budgetMs;
}
