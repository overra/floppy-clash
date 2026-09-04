import type { LevelDef } from '../sim/level/schema';

/**
 * Launch-mode stages: islands with open air on every side, so the blast zone (bounds + killMargin)
 * is the way out. Platform rises stay under REACH.MAX_RISE with REACH.HEADROOM of air beneath, so
 * the validator, the bots and a plain jump all agree on the routes. Tagged 'launch' so the mode
 * prefers them in rotation; they are fine standing-mode arenas too.
 */

/** Battlefield layout: main island, two overhanging side ledges, a perch on top. */
export const skyhold: LevelDef = {
  id: 'launch-skyhold',
  name: 'Skyhold',
  theme: 'castle',
  tags: ['launch'],
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 10, y: 5.5 },
    { x: 22, y: 5.5 },
    { x: 11.5, y: 8.15 },
    { x: 20.5, y: 8.15 },
  ],
  drops: { enabled: true, xMin: 9, xMax: 23, intervalScale: 1.2 },
  objects: [
    { type: 'solid', x: 16, y: 3.3, w: 16, h: 1.4 },
    { type: 'solid', x: 11.5, y: 6.45, w: 3.5, h: 0.4 },
    { type: 'solid', x: 20.5, y: 6.45, w: 3.5, h: 0.4 },
    { type: 'solid', x: 16, y: 9.1, w: 3.5, h: 0.4 },
  ],
};

/** Two floes a running jump apart, a bobbing platform over the gap, a ledge on each outer edge. */
export const floe: LevelDef = {
  id: 'launch-floe',
  name: 'Floe',
  theme: 'winter',
  tags: ['launch'],
  bounds: { x: 0, y: 0, w: 36, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 8, y: 5.5 },
    { x: 28, y: 5.5 },
    { x: 13, y: 5.5 },
    { x: 23, y: 5.5 },
  ],
  drops: { enabled: true, xMin: 6, xMax: 30, intervalScale: 1.2 },
  objects: [
    { type: 'solid', x: 10.25, y: 3.3, w: 10.5, h: 1.4 },
    { type: 'solid', x: 25.75, y: 3.3, w: 10.5, h: 1.4 },
    { type: 'solid', x: 6.5, y: 6.45, w: 3, h: 0.4 },
    { type: 'solid', x: 29.5, y: 6.45, w: 3, h: 0.4 },
    { type: 'platform.moving', x: 18, y: 7, w: 3, h: 0.4, speed: 1.5, path: [{ x: 18, y: 6 }, { x: 18, y: 9 }] },
  ],
};

/** A small island with a single high platform: tight, for duels. */
export const perch: LevelDef = {
  id: 'launch-perch',
  name: 'Perch',
  theme: 'woods',
  tags: ['launch'],
  bounds: { x: 0, y: 0, w: 28, h: 16 },
  killMargin: 6,
  spawns: [
    { x: 10, y: 5.5 },
    { x: 18, y: 5.5 },
    { x: 12.5, y: 8.15 },
    { x: 15.5, y: 8.15 },
  ],
  drops: { enabled: true, xMin: 9, xMax: 19, intervalScale: 1.4 },
  objects: [
    { type: 'solid', x: 14, y: 3.3, w: 12, h: 1.4 },
    { type: 'solid', x: 14, y: 6.45, w: 4, h: 0.4 },
  ],
};

export const LAUNCH_STAGES: LevelDef[] = [skyhold, floe, perch];
