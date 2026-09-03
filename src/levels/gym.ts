import type { LevelDef } from '../sim/level/schema';

/** Movement gym: shafts, gaps for normal / punch / block-punch jumps. */
export const gymLevel: LevelDef = {
  id: 'gym',
  name: 'Movement Gym',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 48, h: 24 },
  killMargin: 8,
  spawns: [
    { x: 4, y: 4 },
    { x: 10, y: 4 },
    { x: 38, y: 4 },
    { x: 44, y: 4 },
  ],
  drops: { enabled: false, xMin: 8, xMax: 40, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 24, y: 1, w: 48, h: 2 },
    { type: 'solid', x: 2, y: 10, w: 2, h: 16 },
    { type: 'solid', x: 8, y: 10, w: 2, h: 16 },
    { type: 'solid', x: 5, y: 3, w: 4, h: 1 },
    { type: 'solid', x: 18, y: 3, w: 4, h: 1 },
    { type: 'solid', x: 26, y: 5, w: 3, h: 1 },
    { type: 'solid', x: 34, y: 8, w: 3, h: 1 },
    { type: 'solid', x: 42, y: 3, w: 8, h: 2 },
  ],
};
