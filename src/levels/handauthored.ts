import type { LevelDef } from '../sim/level/schema';

export const woodsClearing: LevelDef = {
  id: 'woods-01',
  name: 'Clearing',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 4, y: 6 },
    { x: 28, y: 6 },
    { x: 10, y: 12 },
    { x: 22, y: 12 },
  ],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'solid', x: 8, y: 6, w: 4, h: 1 },
    { type: 'solid', x: 24, y: 6, w: 4, h: 1 },
    { type: 'solid', x: 16, y: 10, w: 6, h: 1 },
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
    { x: 3, y: 5 },
    { x: 27, y: 5 },
    { x: 10, y: 9 },
    { x: 20, y: 9 },
  ],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'solid', x: 6, y: 4, w: 6, h: 1 },
    { type: 'solid', x: 24, y: 4, w: 6, h: 1 },
    { type: 'spikes', x: 15, y: 2.4, w: 4, dir: 'up' },
  ],
};

export const desertStack: LevelDef = {
  id: 'desert-01',
  name: 'Box Stack',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [
    { x: 3, y: 4 },
    { x: 25, y: 4 },
    { x: 8, y: 8 },
    { x: 20, y: 8 },
  ],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'crate', x: 12, y: 3, w: 1.2, h: 1.2 },
    { type: 'crate', x: 13.3, y: 3, w: 1.2, h: 1.2 },
    { type: 'crate', x: 12.6, y: 4.3, w: 1.2, h: 1.2 },
    { type: 'crate', x: 16, y: 3, w: 1.2, h: 1.2 },
  ],
};

export const factoryLine: LevelDef = {
  id: 'factory-01',
  name: 'Assembly',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 34, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 4, y: 6 },
    { x: 30, y: 6 },
    { x: 12, y: 10 },
    { x: 22, y: 10 },
  ],
  drops: { enabled: true, xMin: 6, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 17, y: 1, w: 34, h: 2 },
    { type: 'conveyor', x: 17, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'platform.moving', x: 17, y: 9, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
    { type: 'saw', x: 17, y: 4, r: 0.5 },
  ],
};

export const castleKeep: LevelDef = {
  id: 'castle-01',
  name: 'Keep',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 5, y: 5 },
    { x: 27, y: 5 },
    { x: 10, y: 11 },
    { x: 22, y: 11 },
  ],
  drops: { enabled: true, xMin: 6, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'solid', x: 4, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28, y: 8, w: 2, h: 12 },
    { type: 'chain', x: 16, y: 14, links: 6 },
    { type: 'spikeball', x: 16, y: 8, r: 0.45 },
    { type: 'crusher', x: 16, y: 6, w: 2, h: 8, period: 70 },
  ],
};
