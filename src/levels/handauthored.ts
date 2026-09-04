import type { LevelDef } from '../sim/level/schema';

/**
 * Hand-authored showcase arenas. Heights follow the movement envelope in validate.ts: every
 * ledge is within one jump (≤ REACH.MAX_RISE) of a lower surface, and anything floating over a
 * walkable surface leaves REACH.HEADROOM (2.2 m) of air so fighters stroll under it.
 */

export const woodsClearing: LevelDef = {
  id: 'woods-01',
  name: 'Clearing',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 4, y: 3.5 },
    { x: 28, y: 3.5 },
    { x: 8, y: 5.9 },
    { x: 24, y: 5.9 },
  ],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'solid', x: 8, y: 4.4, w: 4, h: 0.4 },
    { type: 'solid', x: 24, y: 4.4, w: 4, h: 0.4 },
    { type: 'solid', x: 16, y: 6.3, w: 6, h: 1 },
    { type: 'crate', x: 16, y: 2.6, w: 1.1, h: 1.1 },
    { type: 'spikes', x: 1.2, y: 2.35, w: 1.8, dir: 'up' },
    { type: 'spikes', x: 30.8, y: 2.35, w: 1.8, dir: 'up' },
  ],
  decor: [{ kind: 'tree', x: 3, y: 2, scale: 1.2 }],
};

export const woodsRidge: LevelDef = {
  id: 'woods-02',
  name: 'Ridge',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [
    { x: 3, y: 3.5 },
    { x: 27, y: 3.5 },
    { x: 7, y: 6 },
    { x: 23, y: 6 },
  ],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'solid', x: 6, y: 4.4, w: 6, h: 0.4 },
    { type: 'solid', x: 24, y: 4.4, w: 6, h: 0.4 },
    { type: 'solid', x: 15, y: 6.3, w: 5, h: 0.8 },
    { type: 'spikes', x: 15, y: 2.35, w: 4, dir: 'up' },
    { type: 'platform.moving', x: 15, y: 9.1, w: 3, h: 0.4, speed: 2.4, path: [{ x: 11, y: 9.1 }, { x: 19, y: 9.1 }] },
  ],
};

export const desertStack: LevelDef = {
  id: 'desert-01',
  name: 'Box Stack',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [
    { x: 3, y: 3.5 },
    { x: 25, y: 3.5 },
    { x: 7, y: 5.5 },
    { x: 21, y: 5.5 },
  ],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'solid', x: 14, y: 5.7, w: 5, h: 0.8 },
    { type: 'solid', x: 7, y: 4.4, w: 3, h: 0.4 },
    { type: 'solid', x: 21, y: 4.4, w: 3, h: 0.4 },
    { type: 'crate', x: 12, y: 2.6, w: 1.2, h: 1.2 },
    { type: 'crate', x: 13.3, y: 2.6, w: 1.2, h: 1.2 },
    { type: 'crate', x: 12.6, y: 3.9, w: 1.2, h: 1.2 },
    { type: 'crate', x: 16, y: 2.6, w: 1.2, h: 1.2 },
    { type: 'barrel.explosive', x: 17.4, y: 2.55, w: 0.8, h: 1.1, hp: 18 },
  ],
};

export const factoryLine: LevelDef = {
  id: 'factory-01',
  name: 'Assembly',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 34, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 4, y: 3.5 },
    { x: 30, y: 3.5 },
    { x: 8, y: 5.9 },
    { x: 26, y: 5.9 },
  ],
  drops: { enabled: true, xMin: 6, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 17, y: 1, w: 34, h: 2 },
    { type: 'conveyor', x: 17, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'solid', x: 8, y: 4.4, w: 4, h: 0.4 },
    { type: 'solid', x: 26, y: 4.4, w: 4, h: 0.4 },
    { type: 'platform.moving', x: 17, y: 6.4, w: 4, h: 0.6, speed: 3, path: [{ x: 13, y: 6.4 }, { x: 21, y: 6.4 }] },
    { type: 'saw', x: 17, y: 4.3, r: 0.5, path: [{ x: 12.5, y: 4.3 }, { x: 21.5, y: 4.3 }], speed: 3 },
    { type: 'barrel.explosive', x: 3, y: 2.55, w: 0.8, h: 1.1, hp: 18 },
  ],
};

export const castleKeep: LevelDef = {
  id: 'castle-01',
  name: 'Keep',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 8, y: 3.5 },
    { x: 24, y: 3.5 },
    { x: 4, y: 6.4 },
    { x: 28, y: 6.4 },
  ],
  drops: { enabled: true, xMin: 6, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'solid', x: 1, y: 10, w: 2, h: 16 },
    { type: 'solid', x: 31, y: 10, w: 2, h: 16 },
    { type: 'solid', x: 4, y: 3, w: 4, h: 2 },
    { type: 'solid', x: 28, y: 3, w: 4, h: 2 },
    { type: 'solid', x: 3.5, y: 4.55, w: 3, h: 0.7 },
    { type: 'solid', x: 28.5, y: 4.55, w: 3, h: 0.7 },
    { type: 'solid', x: 16, y: 4.4, w: 6, h: 0.4 },
    { type: 'block.destructible', x: 12, y: 2.8, w: 1.6, h: 1.6, hp: 60 },
    { type: 'chain', x: 16, y: 9.2, links: 6 },
    { type: 'crusher', x: 16, y: 7.6, w: 2.2, h: 0.8, period: 190, speed: 2.4, delay: 30 },
  ],
};
