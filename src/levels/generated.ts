import type { LevelDef } from '../sim/level/schema';

export const woods_01: LevelDef = {
  id: 'woods-01',
  name: 'Pine',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 9, w: 5, h: 0.6, speed: 4, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 9, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const woods_02: LevelDef = {
  id: 'woods-02',
  name: 'Grove',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 16, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
  ],
};

export const woods_03: LevelDef = {
  id: 'woods-03',
  name: 'Canopy',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'saw', x: 12, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 140 },
    { type: 'ice', x: 18, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 5, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 13, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const woods_04: LevelDef = {
  id: 'woods-04',
  name: 'Hollow',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'platform.moving', x: 16, y: 8, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 21, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 3 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
  ],
};

export const woods_05: LevelDef = {
  id: 'woods-05',
  name: 'Brook',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 8, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 12, y: 8, r: 0.4 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const woods_06: LevelDef = {
  id: 'woods-06',
  name: 'Moss',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 120 },
    { type: 'ice', x: 14, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 9, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 19, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
  ],
};

export const woods_07: LevelDef = {
  id: 'woods-07',
  name: 'Trail',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'platform.collapsing', x: 15, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 5 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 16, y: 14, links: 5 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const desert_01: LevelDef = {
  id: 'desert-01',
  name: 'Dune',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'crate', x: 12, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 22, y: 8, r: 0.4 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const desert_02: LevelDef = {
  id: 'desert-02',
  name: 'Mesa',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'ice', x: 10, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 7, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 10, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
  ],
};

export const desert_03: LevelDef = {
  id: 'desert-03',
  name: 'Oasis',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 12, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const desert_04: LevelDef = {
  id: 'desert-04',
  name: 'Crate Pit',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 17, y: 8, r: 0.4 },
    { type: 'solid', x: 22, y: 5, w: 4, h: 1 },
  ],
};

export const desert_05: LevelDef = {
  id: 'desert-05',
  name: 'Mirage',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'laser', x: 2, y: 5, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 16, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 8, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const desert_06: LevelDef = {
  id: 'desert-06',
  name: 'Arroyo',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 20, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 8, y: 3, w: 1.1, h: 1.1 },
  ],
};

export const desert_07: LevelDef = {
  id: 'desert-07',
  name: 'Stack',
  theme: 'desert',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 12, y: 8, r: 0.4 },
    { type: 'solid', x: 10, y: 4, w: 4, h: 1 },
    { type: 'saw', x: 20, y: 5, r: 0.45 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const factory_01: LevelDef = {
  id: 'factory-01',
  name: 'Gear',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'block.destructible', x: 7, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 7, w: 5, h: 0.6, speed: 2, mode: 'pingpong' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const factory_02: LevelDef = {
  id: 'factory-02',
  name: 'Press',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'chain', x: 16, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 12, y: 3, w: 1.1, h: 1.1 },
  ],
};

export const factory_03: LevelDef = {
  id: 'factory-03',
  name: 'Belt',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'spikeball', x: 22, y: 8, r: 0.4 },
    { type: 'solid', x: 18, y: 3, w: 4, h: 1 },
    { type: 'saw', x: 16, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 160 },
    { type: 'ice', x: 10, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 7, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const factory_04: LevelDef = {
  id: 'factory-04',
  name: 'Smelter',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 9, w: 5, h: 0.6, speed: 4, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 9, y: 5, w: 3, h: 0.5 },
  ],
};

export const factory_05: LevelDef = {
  id: 'factory-05',
  name: 'Catwalk',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 16, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const factory_06: LevelDef = {
  id: 'factory-06',
  name: 'Hopper',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'solid', x: 6, y: 5, w: 4, h: 1 },
    { type: 'saw', x: 12, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 140 },
    { type: 'ice', x: 18, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 5, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 7, y: 4, w: 2, h: 2, hp: 60 },
  ],
};

export const factory_07: LevelDef = {
  id: 'factory-07',
  name: 'Forge',
  theme: 'factory',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 8, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 21, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 3 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const castle_01: LevelDef = {
  id: 'castle-01',
  name: 'Hall',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 8, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const castle_02: LevelDef = {
  id: 'castle-02',
  name: 'Battlement',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'saw', x: 20, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 120 },
    { type: 'ice', x: 14, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 9, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 13, y: 4, w: 2, h: 2, hp: 60 },
  ],
};

export const castle_03: LevelDef = {
  id: 'castle-03',
  name: 'Dungeon',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'platform.moving', x: 16, y: 7, w: 5, h: 0.6, speed: 2, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 15, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 5 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 16, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const castle_04: LevelDef = {
  id: 'castle-04',
  name: 'Chapel',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 12, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
  ],
};

export const castle_05: LevelDef = {
  id: 'castle-05',
  name: 'Moat',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 160 },
    { type: 'ice', x: 10, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 7, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 19, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const castle_06: LevelDef = {
  id: 'castle-06',
  name: 'Tower',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'platform.collapsing', x: 9, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 12, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
  ],
};

export const castle_07: LevelDef = {
  id: 'castle-07',
  name: 'Keep',
  theme: 'castle',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'crate', x: 16, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 17, y: 8, r: 0.4 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const winter_01: LevelDef = {
  id: 'winter-01',
  name: 'Floe',
  theme: 'winter',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'ice', x: 18, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 5, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 10, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const winter_02: LevelDef = {
  id: 'winter-02',
  name: 'Lodge',
  theme: 'winter',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 3 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 20, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
  ],
};

export const winter_03: LevelDef = {
  id: 'winter-03',
  name: 'Icefall',
  theme: 'winter',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 12, y: 8, r: 0.4 },
    { type: 'solid', x: 22, y: 4, w: 4, h: 1 },
    { type: 'saw', x: 20, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 120 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const winter_04: LevelDef = {
  id: 'winter-04',
  name: 'Drift',
  theme: 'winter',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'laser', x: 2, y: 9, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 16, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
  ],
};

export const winter_05: LevelDef = {
  id: 'winter-05',
  name: 'Sled',
  theme: 'winter',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 16, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const winter_06: LevelDef = {
  id: 'winter-06',
  name: 'Cabin',
  theme: 'winter',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 22, y: 8, r: 0.4 },
    { type: 'solid', x: 10, y: 3, w: 4, h: 1 },
    { type: 'saw', x: 16, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 160 },
    { type: 'ice', x: 10, y: 2.2, w: 6, h: 0.5 },
  ],
};

export const winter_07: LevelDef = {
  id: 'winter-07',
  name: 'Peak',
  theme: 'winter',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'block.destructible', x: 7, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 9, w: 5, h: 0.6, speed: 4, mode: 'pingpong' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const lava_01: LevelDef = {
  id: 'lava-01',
  name: 'Caldera',
  theme: 'lava',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'chain', x: 12, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const lava_02: LevelDef = {
  id: 'lava-02',
  name: 'Crust',
  theme: 'lava',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'spikeball', x: 17, y: 8, r: 0.4 },
    { type: 'solid', x: 18, y: 5, w: 4, h: 1 },
    { type: 'saw', x: 12, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 140 },
    { type: 'ice', x: 18, y: 2.2, w: 6, h: 0.5 },
  ],
};

export const lava_03: LevelDef = {
  id: 'lava-03',
  name: 'Vent',
  theme: 'lava',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 8, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 21, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 3 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const lava_04: LevelDef = {
  id: 'lava-04',
  name: 'Magma',
  theme: 'lava',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 8, y: 3, w: 1.1, h: 1.1 },
  ],
};

export const lava_05: LevelDef = {
  id: 'lava-05',
  name: 'Ash',
  theme: 'lava',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'solid', x: 6, y: 4, w: 4, h: 1 },
    { type: 'saw', x: 20, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 120 },
    { type: 'ice', x: 14, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 9, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const lava_06: LevelDef = {
  id: 'lava-06',
  name: 'Cinder',
  theme: 'lava',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 7, w: 5, h: 0.6, speed: 2, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 15, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 5 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 16, y: 14, links: 5 },
  ],
};

export const lava_07: LevelDef = {
  id: 'lava-07',
  name: 'Basin',
  theme: 'lava',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 12, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const laser_01: LevelDef = {
  id: 'laser-01',
  name: 'Grid',
  theme: 'laser',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'saw', x: 16, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 160 },
    { type: 'ice', x: 10, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 7, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const laser_02: LevelDef = {
  id: 'laser-02',
  name: 'Pulse',
  theme: 'laser',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'platform.moving', x: 16, y: 9, w: 5, h: 0.6, speed: 4, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 9, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 12, y: 14, links: 5 },
  ],
};

export const laser_03: LevelDef = {
  id: 'laser-03',
  name: 'Array',
  theme: 'laser',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 16, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 17, y: 8, r: 0.4 },
    { type: 'solid', x: 6, y: 5, w: 4, h: 1 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const laser_04: LevelDef = {
  id: 'laser-04',
  name: 'Beam',
  theme: 'laser',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 140 },
    { type: 'ice', x: 18, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 5, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 19, y: 4, w: 2, h: 2, hp: 60 },
  ],
};

export const laser_05: LevelDef = {
  id: 'laser-05',
  name: 'Node',
  theme: 'laser',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'platform.collapsing', x: 21, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 3 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 20, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const laser_06: LevelDef = {
  id: 'laser-06',
  name: 'Circuit',
  theme: 'laser',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'crate', x: 8, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 12, y: 8, r: 0.4 },
    { type: 'solid', x: 14, y: 4, w: 4, h: 1 },
    { type: 'saw', x: 20, y: 5, r: 0.45 },
  ],
};

export const laser_07: LevelDef = {
  id: 'laser-07',
  name: 'Core',
  theme: 'laser',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'ice', x: 14, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 9, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 10, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const western_01: LevelDef = {
  id: 'western-01',
  name: 'Saloon',
  theme: 'western',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  startingWeapons: [
    { weapon: 'revolver', x: 10, y: 4 },
    { weapon: 'pistol', x: 18, y: 4 },
  ],
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 5 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 16, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const western_02: LevelDef = {
  id: 'western-02',
  name: 'Canyon',
  theme: 'western',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  startingWeapons: [{ weapon: 'revolver', x: 15, y: 4 }],
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 22, y: 8, r: 0.4 },
    { type: 'solid', x: 22, y: 3, w: 4, h: 1 },
    { type: 'saw', x: 16, y: 5, r: 0.45 },
  ],
};

export const western_03: LevelDef = {
  id: 'western-03',
  name: 'Rails',
  theme: 'western',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  startingWeapons: [{ weapon: 'pistol', x: 16, y: 4 }],
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'laser', x: 2, y: 7, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 16, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 9, w: 5, h: 0.6, speed: 4, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 9, y: 5, w: 3, h: 0.5 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const western_04: LevelDef = {
  id: 'western-04',
  name: 'Mine',
  theme: 'western',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  startingWeapons: [{ weapon: 'revolver', x: 14, y: 4 }],
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 12, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
  ],
};

export const western_05: LevelDef = {
  id: 'western-05',
  name: 'Gulch',
  theme: 'western',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  startingWeapons: [{ weapon: 'pistol', x: 15, y: 4 }],
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 17, y: 8, r: 0.4 },
    { type: 'solid', x: 10, y: 5, w: 4, h: 1 },
    { type: 'saw', x: 12, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 140 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const western_06: LevelDef = {
  id: 'western-06',
  name: 'Depot',
  theme: 'western',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  startingWeapons: [{ weapon: 'revolver', x: 16, y: 4 }],
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'block.destructible', x: 7, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 8, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 21, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 3 },
  ],
};

export const western_07: LevelDef = {
  id: 'western-07',
  name: 'Corral',
  theme: 'western',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  startingWeapons: [{ weapon: 'pistol', x: 14, y: 4 }],
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'chain', x: 20, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const halloween_01: LevelDef = {
  id: 'halloween-01',
  name: 'Crypt',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'spikeball', x: 12, y: 8, r: 0.4 },
    { type: 'solid', x: 18, y: 4, w: 4, h: 1 },
    { type: 'saw', x: 20, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 120 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const halloween_02: LevelDef = {
  id: 'halloween-02',
  name: 'Pumpkin',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 7, w: 5, h: 0.6, speed: 2, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 15, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 5 },
  ],
};

export const halloween_03: LevelDef = {
  id: 'halloween-03',
  name: 'Grave',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 12, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const halloween_04: LevelDef = {
  id: 'halloween-04',
  name: 'Manor',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'solid', x: 6, y: 3, w: 4, h: 1 },
    { type: 'saw', x: 16, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 160 },
    { type: 'ice', x: 10, y: 2.2, w: 6, h: 0.5 },
  ],
};

export const halloween_05: LevelDef = {
  id: 'halloween-05',
  name: 'Fog',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 9, w: 5, h: 0.6, speed: 4, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 9, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const halloween_06: LevelDef = {
  id: 'halloween-06',
  name: 'Bone Pit',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0 },
    { type: 'platform.rotating', x: 22, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 16, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 17, y: 8, r: 0.4 },
  ],
};

export const halloween_07: LevelDef = {
  id: 'halloween-07',
  name: 'Attic',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'saw', x: 12, y: 5, r: 0.45 },
    { type: 'platform.disappearing', x: 8, y: 6, w: 3, h: 0.5, period: 140 },
    { type: 'ice', x: 18, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 5, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const halloween_boss: LevelDef = {
  id: 'halloween-boss',
  name: 'Lich',
  theme: 'halloween',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [
    { x: 4, y: 5 },
    { x: 26, y: 5 },
    { x: 8, y: 10 },
    { x: 22, y: 10 },
  ],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'boss', x: 15, y: 4, w: 2.2, h: 2.0, hp: 200 },
    { type: 'spikes', x: 15, y: 2.4, w: 4, dir: 'up' },
    { type: 'platform.disappearing', x: 8, y: 7, w: 3, h: 0.5, period: 140 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const arena_01: LevelDef = {
  id: 'arena-01',
  name: 'Ring',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'platform.moving', x: 16, y: 8, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
    { type: 'platform.collapsing', x: 21, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 3 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const arena_02: LevelDef = {
  id: 'arena-02',
  name: 'Pit',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 30, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
    { type: 'crate', x: 8, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 23, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 12, y: 8, r: 0.4 },
  ],
};

export const arena_03: LevelDef = {
  id: 'arena-03',
  name: 'Coliseum',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 32, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'platform.disappearing', x: 18, y: 6, w: 3, h: 0.5, period: 120 },
    { type: 'ice', x: 14, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 9, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 19, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 19, y: 2.4, w: 3, dir: 'up' },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 30.8, y: 8, w: 2, h: 12 },
  ],
};

export const arena_04: LevelDef = {
  id: 'arena-04',
  name: 'Gym',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 28, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'platform.collapsing', x: 15, y: 5, w: 3, h: 0.5 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 5 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 16, y: 14, links: 5 },
  ],
};

export const arena_05: LevelDef = {
  id: 'arena-05',
  name: 'Dojo',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 30, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 26, y: 5 }, { x: 8, y: 10 }, { x: 22, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 26, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 15, y: 1, w: 30, h: 2 },
    { type: 'crate', x: 12, y: 3, w: 1.1, h: 1.1 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
    { type: 'crusher', x: 14, y: 8, w: 1.5, h: 6, period: 60 },
    { type: 'spikeball', x: 22, y: 8, r: 0.4 },
    { type: 'solid', x: 14, y: 3, w: 4, h: 1 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 28.8, y: 8, w: 2, h: 12 },
  ],
};

export const arena_06: LevelDef = {
  id: 'arena-06',
  name: 'Bowl',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 28, y: 5 }, { x: 8, y: 10 }, { x: 24, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'ice', x: 10, y: 2.2, w: 6, h: 0.5 },
    { type: 'laser', x: 2, y: 7, onTicks: 40, offTicks: 50, warningTicks: 12 },
    { type: 'block.destructible', x: 10, y: 4, w: 2, h: 2, hp: 60 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
    { type: 'platform.moving', x: 16, y: 9, w: 5, h: 0.6, speed: 4, mode: 'pingpong' },
  ],
};

export const arena_07: LevelDef = {
  id: 'arena-07',
  name: 'Stage',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [{ x: 4, y: 5 }, { x: 24, y: 5 }, { x: 8, y: 10 }, { x: 20, y: 10 }],
  drops: { enabled: true, xMin: 4, xMax: 24, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 14, y: 1, w: 28, h: 2 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 4 },
    { type: 'barrel.explosive', x: 19, y: 3, w: 0.8, h: 1.1, hp: 18 },
    { type: 'chain', x: 12, y: 14, links: 5 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
    { type: 'solid', x: 1.2, y: 8, w: 2, h: 12 },
    { type: 'solid', x: 26.8, y: 8, w: 2, h: 12 },
  ],
};

export const test_solid: LevelDef = {
  id: 'test-solid',
  name: 'Test solid',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'solid', x: 10, y: 4, w: 4, h: 1 },
  ],
};

export const test_spikes: LevelDef = {
  id: 'test-spikes',
  name: 'Test spikes',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'spikes', x: 13, y: 2.4, w: 3, dir: 'up' },
  ],
};

export const test_lava: LevelDef = {
  id: 'test-lava',
  name: 'Test lava',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'lava', x: 16, y: 1.6, w: 8, h: 1.2, rate: 0.02 },
  ],
};

export const test_saw: LevelDef = {
  id: 'test-saw',
  name: 'Test saw',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'saw', x: 16, y: 5, r: 0.45, speed: 2.4 },
  ],
};

export const test_platform_moving: LevelDef = {
  id: 'test-platform.moving',
  name: 'Test platform.moving',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'platform.moving', x: 16, y: 8, w: 5, h: 0.6, speed: 3, mode: 'pingpong' },
  ],
};

export const test_platform_rotating: LevelDef = {
  id: 'test-platform.rotating',
  name: 'Test platform.rotating',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'platform.rotating', x: 14, y: 8, w: 4, h: 0.6, omega: 1 },
  ],
};

export const test_platform_disappearing: LevelDef = {
  id: 'test-platform.disappearing',
  name: 'Test platform.disappearing',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'platform.disappearing', x: 13, y: 6, w: 3, h: 0.5, period: 140 },
  ],
};

export const test_platform_collapsing: LevelDef = {
  id: 'test-platform.collapsing',
  name: 'Test platform.collapsing',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'platform.collapsing', x: 15, y: 5, w: 3, h: 0.5 },
  ],
};

export const test_crate: LevelDef = {
  id: 'test-crate',
  name: 'Test crate',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'crate', x: 10, y: 3, w: 1.1, h: 1.1 },
  ],
};

export const test_ice: LevelDef = {
  id: 'test-ice',
  name: 'Test ice',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'ice', x: 14, y: 2.2, w: 18, h: 0.5 },
  ],
};

export const test_conveyor: LevelDef = {
  id: 'test-conveyor',
  name: 'Test conveyor',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'conveyor', x: 16, y: 2.2, w: 10, h: 0.4, speed: 4 },
  ],
};

export const test_bounce: LevelDef = {
  id: 'test-bounce',
  name: 'Test bounce',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'bounce', x: 13, y: 2.3, w: 2, h: 0.4 },
  ],
};

export const test_laser: LevelDef = {
  id: 'test-laser',
  name: 'Test laser',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'laser', x: 2, y: 7, onTicks: 40, offTicks: 50, warningTicks: 12 },
  ],
};

export const test_barrel_explosive: LevelDef = {
  id: 'test-barrel.explosive',
  name: 'Test barrel.explosive',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'barrel.explosive', x: 13, y: 3, w: 0.8, h: 1.1, hp: 18 },
  ],
};

export const test_crusher: LevelDef = {
  id: 'test-crusher',
  name: 'Test crusher',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'crusher', x: 18, y: 8, w: 1.5, h: 6, period: 60 },
  ],
};

export const test_block_destructible: LevelDef = {
  id: 'test-block.destructible',
  name: 'Test block.destructible',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'block.destructible', x: 10, y: 4, w: 2, h: 2, hp: 60 },
  ],
};

export const test_chain: LevelDef = {
  id: 'test-chain',
  name: 'Test chain',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'chain', x: 16, y: 14, links: 5, w: 3.2, h: 0.45 },
  ],
};

export const test_spikeball: LevelDef = {
  id: 'test-spikeball',
  name: 'Test spikeball',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'spikeball', x: 17, y: 8, r: 0.4 },
  ],
};

export const test_spikeball_roll: LevelDef = {
  id: 'test-spikeball-roll',
  name: 'Test spikeball roll',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'spikeball', x: 10, y: 3.2, r: 0.4, style: 'roll' },
  ],
};

export const test_spikeball_drop: LevelDef = {
  id: 'test-spikeball-drop',
  name: 'Test spikeball drop',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'spikeball', x: 16, y: 11, r: 0.4, style: 'drop' },
  ],
};

export const test_trigger_drop: LevelDef = {
  id: 'test-trigger.drop',
  name: 'Test trigger.drop',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'trigger.drop', x: 16, y: 12, atTick: 200, weapon: 'pistol' },
  ],
};

export const test_platform_momentum: LevelDef = {
  id: 'test-platform.momentum',
  name: 'Test platform.momentum',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 24, h: 14 },
  killMargin: 6,
  spawns: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 8, y: 8 }, { x: 16, y: 8 }],
  drops: { enabled: false, xMin: 4, xMax: 20, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 12, y: 1, w: 24, h: 2 },
    { type: 'platform.momentum', x: 16, y: 6, w: 4, h: 0.6 },
  ],
};

export const test_void: LevelDef = {
  id: 'test-void',
  name: 'Test void',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 16, h: 10 },
  killMargin: 2,
  spawns: [{ x: 4, y: 4 }, { x: 12, y: 4 }, { x: 6, y: 6 }, { x: 10, y: 6 }],
  drops: { enabled: false, xMin: 4, xMax: 12, intervalScale: 1 },
  objects: [{ type: 'solid', x: 8, y: 1, w: 16, h: 2 }],
};

export const GENERATED_LEVELS: LevelDef[] = [
  woods_01,
  woods_02,
  woods_03,
  woods_04,
  woods_05,
  woods_06,
  woods_07,
  desert_01,
  desert_02,
  desert_03,
  desert_04,
  desert_05,
  desert_06,
  desert_07,
  factory_01,
  factory_02,
  factory_03,
  factory_04,
  factory_05,
  factory_06,
  factory_07,
  castle_01,
  castle_02,
  castle_03,
  castle_04,
  castle_05,
  castle_06,
  castle_07,
  winter_01,
  winter_02,
  winter_03,
  winter_04,
  winter_05,
  winter_06,
  winter_07,
  lava_01,
  lava_02,
  lava_03,
  lava_04,
  lava_05,
  lava_06,
  lava_07,
  laser_01,
  laser_02,
  laser_03,
  laser_04,
  laser_05,
  laser_06,
  laser_07,
  western_01,
  western_02,
  western_03,
  western_04,
  western_05,
  western_06,
  western_07,
  halloween_01,
  halloween_02,
  halloween_03,
  halloween_04,
  halloween_05,
  halloween_06,
  halloween_07,
  halloween_boss,
  arena_01,
  arena_02,
  arena_03,
  arena_04,
  arena_05,
  arena_06,
  arena_07,
  test_solid,
  test_spikes,
  test_lava,
  test_saw,
  test_platform_moving,
  test_platform_rotating,
  test_platform_disappearing,
  test_platform_collapsing,
  test_crate,
  test_ice,
  test_conveyor,
  test_bounce,
  test_laser,
  test_barrel_explosive,
  test_crusher,
  test_block_destructible,
  test_chain,
  test_spikeball,
  test_spikeball_roll,
  test_spikeball_drop,
  test_trigger_drop,
  test_platform_momentum,
  test_void,
];