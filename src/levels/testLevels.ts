import type { LevelDef } from '../sim/level/schema';

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
    { type: 'saw', x: 16, y: 5, r: 0.45 },
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
    { type: 'ice', x: 14, y: 2.2, w: 6, h: 0.5 },
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
    { type: 'chain', x: 16, y: 14, links: 5 },
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

/** One tiny arena per hazard type; used by the hazard unit tests and never by matches. */
export const TEST_LEVELS: LevelDef[] = [
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
  test_trigger_drop,
  test_platform_momentum,
];
