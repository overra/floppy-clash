import type { LevelDef } from '../sim/level/schema';

/** Movement gym: 2 m climb shaft, calibrated jump gaps, and a 40 m run strip. */
export const gymLevel: LevelDef = {
  id: 'gym',
  name: 'Movement Gym',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 52, h: 22 },
  killMargin: 8,
  spawns: [
    { x: 14, y: 4 },
    { x: 20, y: 4 },
    { x: 36, y: 4 },
    { x: 44, y: 4 },
  ],
  drops: { enabled: false, xMin: 12, xMax: 44, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 26, y: 1, w: 52, h: 2 },
    // Climb shaft: interior x=3..5 (2 m), walls to y≈14 (6+ tiles above the floor).
    { type: 'solid', x: 2.5, y: 8, w: 1, h: 12 },
    { type: 'solid', x: 5.5, y: 8, w: 1, h: 12 },
    // Jump-gap ledges well clear of the shaft and the run strip.
    { type: 'solid', x: 22, y: 3.4, w: 3, h: 0.5 },
    { type: 'solid', x: 28, y: 5.0, w: 3, h: 0.5 },
    { type: 'solid', x: 34, y: 7.0, w: 3, h: 0.5 },
  ],
};

/** Empty 60 m corridor used by the 30 m / 4 s run acceptance test. */
export const runTrack: LevelDef = {
  id: 'run-track',
  name: 'Run Track',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 60, h: 12 },
  killMargin: 8,
  spawns: [
    { x: 4, y: 4 },
    { x: 10, y: 4 },
    { x: 16, y: 4 },
    { x: 22, y: 4 },
  ],
  drops: { enabled: false, xMin: 4, xMax: 56, intervalScale: 1 },
  objects: [{ type: 'solid', x: 30, y: 1, w: 60, h: 2 }],
};
