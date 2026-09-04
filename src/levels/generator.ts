import { SeededRng } from '../core/rng';
import type { LevelDef, LevelObject } from '../sim/level/schema';
import type { ThemeId } from '../sim/level/themes';
import { REACH, validateLevel } from './validate';

/**
 * Arena generator. Ten authored silhouettes ("archetypes") × ten themes, each theme dressing a
 * silhouette with hazards from its own palette. Every arena is checked against the movement
 * envelope (see validate.ts) so nothing is unreachable without relying on movers or crates, no
 * spawn lands on a hazard, and no platform is a dead end.
 *
 * Silhouette rules of thumb (from validate.ts): a ledge is one hop up if it is ≤ REACH.MAX_RISE
 * (~2.7 m) above the surface you stand on and you have ≥ 0.6 m of standing room beside it;
 * horizontal gaps shrink from ~5.4 m (level) to ~3.5 m (2.5 m rise). Walls ≤ 3.2 m can be
 * wall-jumped. Anything hung over a walkable surface leaves REACH.HEADROOM (2.2 m) of air, so a
 * thin platform placed with `over()` is both walk-under and a single hop up.
 */

type Vec = { x: number; y: number };
type FloorSlot = { x: number; top: number; w: number };
type AirSlot = { x: number; y: number; over: number };
type CeilingSlot = { x: number; surfaceTop: number; w: number };
type PitSlot = { x1: number; x2: number; floor: number };
type BridgeSlot = { x: number; y: number; w: number };

type Blueprint = {
  objects: LevelObject[];
  spawns: Vec[];
  floor: FloorSlot[];
  air: AirSlot[];
  ceiling: CeilingSlot[];
  pit: PitSlot | null;
  bridge: BridgeSlot[];
};

type Archetype = { key: string; name: string; build: (W: number, H: number) => Blueprint };

const H = 18;
/** Floating platforms are thin so that one hung with full headroom is still a single hop up. */
const PLAT_T = 0.4;
const HEADROOM = REACH.HEADROOM;

const slab = (x1: number, x2: number, top: number, thick: number): LevelObject => ({
  type: 'solid',
  x: (x1 + x2) / 2,
  y: top - thick / 2,
  w: x2 - x1,
  h: thick,
});
const plat = (x1: number, x2: number, top: number, thick = PLAT_T): LevelObject => slab(x1, x2, top, thick);
/** Top of a thin platform hung over a surface at `top` with a full head of air beneath it. */
const over = (top: number, thick = PLAT_T): number => Math.round((top + HEADROOM + thick) * 100) / 100;
/** Boundary wall running to the ceiling: not a surface, just a backstop. */
const wall = (x1: number, x2: number, bottom: number): LevelObject => slab(x1, x2, H, H - bottom);
const stand = (x: number, top: number): Vec => ({ x, y: top + 1.5 });

const ARCHETYPES: Archetype[] = [
  {
    key: 'plains',
    name: 'Plains',
    build(W) {
      const c = W / 2;
      const top = over(4.2);
      return {
        objects: [slab(0, W, 2, 2), slab(0, 5, 3.5, 1.5), slab(W - 5, W, 3.5, 1.5), slab(c - 4.5, c + 4.5, 4.2, 2.2), plat(c - 2.5, c + 2.5, top)],
        spawns: [stand(2.5, 3.5), stand(W - 2.5, 3.5), stand(c - 8.5, 2), stand(c + 8.5, 2)],
        floor: [
          { x: c - 6, top: 2, w: 1.6 },
          { x: c + 6, top: 2, w: 1.6 },
        ],
        air: [{ x: c, y: top + 3.2, over: top }],
        ceiling: [],
        pit: null,
        bridge: [],
      };
    },
  },
  {
    key: 'chasm',
    name: 'Chasm',
    build(W) {
      const c = W / 2;
      const lowL = (6 + (c - 3.5)) / 2;
      const lowW = Math.min(2, c - 3.5 - 6 - 1);
      const perch = over(4.4);
      return {
        objects: [
          slab(0, 6, 4.4, 4.4),
          slab(W - 6, W, 4.4, 4.4),
          slab(6, c - 3.5, 2, 2),
          slab(c + 3.5, W - 6, 2, 2),
          plat(c - 2, c + 2, 4.4),
          plat(1.5, 4.5, perch),
          plat(W - 4.5, W - 1.5, perch),
          wall(0, 1.5, 4.4),
          wall(W - 1.5, W, 4.4),
        ],
        spawns: [stand(3, perch), stand(W - 3, perch), stand(5.2, 4.4), stand(W - 5.2, 4.4)],
        floor: [
          { x: lowL, top: 2, w: lowW },
          { x: W - lowL, top: 2, w: lowW },
        ],
        air: [{ x: c, y: 7.9, over: 4.4 }],
        ceiling: [],
        pit: { x1: c - 3.5, x2: c + 3.5, floor: 0 },
        bridge: [],
      };
    },
  },
  {
    key: 'spires',
    name: 'Spires',
    build(W) {
      const c = W / 2;
      return {
        objects: [
          slab(0, W, 2, 2),
          slab(7.7, 10.7, 6.6, 6.6),
          slab(W - 10.7, W - 7.7, 6.6, 6.6),
          slab(4.7, 7.7, 4.2, 2.2),
          slab(W - 7.7, W - 4.7, 4.2, 2.2),
          slab(10.7, 13.2, 4.2, 2.2),
          slab(W - 13.2, W - 10.7, 4.2, 2.2),
          plat(c - 2, c + 2, over(4.2)),
        ],
        spawns: [stand(9.2, 6.6), stand(W - 9.2, 6.6), stand(2.4, 2), stand(W - 2.4, 2)],
        floor: [{ x: c, top: 2, w: Math.max(1, Math.min(3, W - 2 * 13.2 - 0.6)) }],
        air: [{ x: c, y: over(4.2) + 2.8, over: over(4.2) }],
        ceiling: [{ x: c, surfaceTop: 2, w: Math.max(1, Math.min(2, W - 2 * 13.2 - 0.4)) }],
        pit: null,
        bridge: [],
      };
    },
  },
  {
    key: 'archipelago',
    name: 'Archipelago',
    build(W) {
      const c = W / 2;
      const moverAmp = Math.max(0.5, (W - 13 - 13) / 2 - 1.5);
      // Tiers: big islands (4) → thin stepping islands (5.2, a head above the low ferry) → centre
      // deck → crow's nest, each a single hop up with a full head of air beneath it.
      const step = 5.2;
      const deck = over(step);
      const nest = over(deck);
      return {
        objects: [
          slab(2, 10, 4, 1.2),
          slab(W - 10, W - 2, 4, 1.2),
          plat(10.5, 13, step),
          plat(W - 13, W - 10.5, step),
          plat(c - 2.5, c + 2.5, deck),
          plat(c - 1.5, c + 1.5, nest),
          { type: 'platform.moving', x: c, y: 2.3, w: 3, h: 0.6, speed: 2.5, path: [{ x: c - moverAmp, y: 2.3 }, { x: c + moverAmp, y: 2.3 }] },
        ],
        spawns: [stand(4, 4), stand(8, 4), stand(W - 4, 4), stand(W - 8, 4)],
        floor: [],
        air: [{ x: c, y: nest + 2.8, over: nest }],
        ceiling: [],
        pit: null,
        bridge: [],
      };
    },
  },
  {
    key: 'terraces',
    name: 'Terraces',
    build(W) {
      const c = W / 2;
      const low = over(2);
      const high = over(low);
      return {
        objects: [
          slab(0, W, 2, 2),
          slab(0, 8, 3.8, 1.8),
          slab(0, 5, 5.6, 1.8),
          slab(0, 1.5, 7.4, 1.8),
          plat(W - 7, W - 2, low),
          plat(c - 2.5, c + 2.5, low),
          plat(c - 1.5, c + 1.5, high),
        ],
        spawns: [stand(6.5, 3.8), stand(Math.max(9.5, c - 6.5), 2), stand(W - 4.5, low), stand(c + 6.6, 2)],
        // Clear of the centre platform above (so ice/conveyors do not run under it) and of spawn 3.
        floor: [{ x: c + 4.2, top: 2, w: 1.6 }],
        air: [{ x: c, y: high + 2.8, over: high }],
        ceiling: [{ x: 3.1, surfaceTop: 5.6, w: 1.6 }],
        pit: null,
        bridge: [],
      };
    },
  },
  {
    key: 'crossing',
    name: 'Crossing',
    build(W) {
      const c = W / 2;
      const span = W - 18;
      const segW = (span - 2) / 3;
      const segs: BridgeSlot[] = [0, 1, 2].map((i) => ({ x: 9 + segW / 2 + i * (segW + 1), y: 2.7, w: segW }));
      const side = over(3);
      return {
        objects: [slab(0, 9, 3, 3), slab(W - 9, W, 3, 3), plat(3, c - 6, side), plat(W - c + 6, W - 3, side), plat(c - 3, c + 3, 6.4)],
        spawns: [stand(4.5, 3), stand(W - 4.5, 3), stand(5.5, side), stand(W - 5.5, side)],
        floor: [],
        air: [{ x: c, y: 9.6, over: 6.4 }],
        ceiling: [],
        pit: { x1: 9, x2: W - 9, floor: 0 },
        bridge: segs,
      };
    },
  },
  {
    key: 'colosseum',
    name: 'Colosseum',
    build(W) {
      const c = W / 2;
      const tier = over(2);
      const crown = over(4.2);
      return {
        objects: [
          slab(0, W, 2, 2),
          wall(0, 1.5, 2),
          wall(W - 1.5, W, 2),
          slab(c - 3, c + 3, 4.2, 2.2),
          plat(5, c - 5, tier),
          plat(W - c + 5, W - 5, tier),
          plat(c - 3.5, c + 3.5, crown),
        ],
        spawns: [stand(c - 4.5, 2), stand(c + 4.5, 2), stand(6, tier), stand(W - 6, tier)],
        floor: [
          { x: 3, top: 2, w: 1.6 },
          { x: W - 3, top: 2, w: 1.6 },
        ],
        air: [{ x: c, y: crown + 3, over: crown }],
        ceiling: [{ x: c, surfaceTop: crown, w: 2.4 }],
        pit: null,
        bridge: [],
      };
    },
  },
  {
    key: 'gorge',
    name: 'Gorge',
    build(W) {
      const c = W / 2;
      const innerL = 10.5;
      const pillarL = c - 1;
      const fx = (innerL + pillarL) / 2;
      const fw = Math.min(2, pillarL - innerL - 1);
      return {
        objects: [
          slab(0, 8, 6, 6),
          slab(W - 8, W, 6, 6),
          slab(8, W - 8, 2, 2),
          slab(8, 10.5, 4, 2),
          slab(W - 10.5, W - 8, 4, 2),
          slab(c - 1, c + 1, 4.4, 2.4),
        ],
        spawns: [stand(4, 6), stand(W - 4, 6), stand(9.25, 4), stand(W - 9.25, 4)],
        floor: [
          { x: fx, top: 2, w: fw },
          { x: W - fx, top: 2, w: fw },
          { x: 6.5, top: 6, w: 1.6 },
          { x: W - 6.5, top: 6, w: 1.6 },
        ],
        air: [{ x: c, y: 9, over: 4.4 }],
        ceiling: [],
        pit: null,
        bridge: [],
      };
    },
  },
  {
    key: 'ledge',
    name: 'Ledge',
    build(W) {
      const c = W / 2;
      const shelf = over(2);
      const perch = over(shelf);
      return {
        objects: [
          slab(0, W, 2, 2),
          slab(0, 2, 6.8, 4.8),
          slab(0, 12, 6.8, 1.0),
          slab(12, 15, 4.4, 2.4),
          plat(W - 8, W - 3, shelf),
          plat(W - 6, W - 2, perch),
        ],
        spawns: [stand(5, 6.8), stand(W - 5.5, shelf), stand(c + 2, 2), stand(c + 5, 2)],
        floor: [{ x: 4, top: 2, w: 2 }],
        air: [{ x: c + 3.5, y: shelf + 4.6, over: shelf }],
        ceiling: [{ x: 7.5, surfaceTop: 2, w: 2.2 }],
        pit: null,
        bridge: [],
      };
    },
  },
  {
    key: 'drift',
    name: 'Drift',
    build(W) {
      const c = W / 2;
      // Ferries ride low under the step platforms (a full head of air) without clipping the slabs:
      // the sweep runs from the slab's edge (8) to under the step's far end (11.65).
      const ferryY = 2.2;
      const ferryX = 9.85;
      const mover = (x: number): LevelObject => ({
        type: 'platform.moving',
        x,
        y: ferryY,
        w: 2.4,
        h: 0.6,
        speed: 2.2,
        path: [{ x: x - 0.6, y: ferryY }, { x: x + 0.6, y: ferryY }],
      });
      const step = 5.1;
      const deckHalf = Math.min(2.5, c - 12.2);
      // Leave ≥ 0.7 m of deck either side of the nest to launch from.
      const nestHalf = Math.min(1.5, deckHalf - 0.7);
      const nest = over(6.4);
      return {
        objects: [
          slab(1, 8, 4, 1.2),
          slab(W - 8, W - 1, 4, 1.2),
          plat(9.5, 12, step),
          plat(W - 12, W - 9.5, step),
          plat(c - deckHalf, c + deckHalf, 6.4),
          plat(c - nestHalf, c + nestHalf, nest),
          mover(ferryX),
          mover(W - ferryX),
        ],
        spawns: [stand(3, 4), stand(W - 3, 4), stand(c - deckHalf + 0.6, 6.4), stand(c + deckHalf - 0.6, 6.4)],
        floor: [
          { x: 6.6, top: 4, w: 1.2 },
          { x: W - 6.6, top: 4, w: 1.2 },
        ],
        air: [{ x: c, y: nest + 2.8, over: nest }],
        ceiling: [],
        pit: null,
        bridge: [],
      };
    },
  },
];

type FloorHazard = 'spikes' | 'crate' | 'bounce' | 'barrel' | 'ice' | 'conveyor' | 'block' | 'laser-low';
type PitHazard = 'spikes' | 'void' | 'lava' | 'lava-rising' | 'saw';
type AirHazard = 'saw' | 'saw-sweep' | 'spikeball' | 'laser' | 'platform.disappearing' | 'platform.moving';
type CeilingHazard = 'crusher' | 'chain' | 'laser';
type BridgeKind = 'solid' | 'block.destructible' | 'platform.collapsing';

type Palette = {
  adjective: string;
  floor: FloorHazard[];
  pit: PitHazard[];
  air: AirHazard[];
  ceiling: CeilingHazard[];
  bridge: BridgeKind;
};

const PALETTES: Record<ThemeId, Palette> = {
  woods: { adjective: 'Pine', floor: ['spikes', 'crate', 'bounce'], pit: ['spikes', 'void'], air: ['saw', 'platform.moving'], ceiling: ['chain'], bridge: 'platform.collapsing' },
  desert: { adjective: 'Dune', floor: ['spikes', 'crate', 'bounce', 'barrel'], pit: ['spikes', 'void'], air: ['saw-sweep', 'spikeball'], ceiling: ['crusher'], bridge: 'platform.collapsing' },
  factory: { adjective: 'Iron', floor: ['conveyor', 'barrel', 'block'], pit: ['saw', 'spikes'], air: ['saw-sweep', 'platform.moving'], ceiling: ['crusher'], bridge: 'block.destructible' },
  castle: { adjective: 'Stone', floor: ['spikes', 'block'], pit: ['spikes', 'lava'], air: ['spikeball', 'platform.disappearing'], ceiling: ['crusher', 'chain'], bridge: 'block.destructible' },
  winter: { adjective: 'Frost', floor: ['ice', 'spikes', 'ice'], pit: ['spikes', 'void'], air: ['platform.disappearing', 'platform.moving'], ceiling: ['chain'], bridge: 'platform.collapsing' },
  lava: { adjective: 'Molten', floor: ['barrel', 'block'], pit: ['lava', 'lava-rising'], air: ['platform.disappearing', 'saw'], ceiling: ['crusher'], bridge: 'platform.collapsing' },
  laser: { adjective: 'Neon', floor: ['bounce', 'block', 'laser-low'], pit: ['void', 'spikes'], air: ['laser', 'platform.disappearing'], ceiling: ['laser'], bridge: 'block.destructible' },
  western: { adjective: 'Dusty', floor: ['barrel', 'crate', 'spikes', 'bounce'], pit: ['spikes', 'void'], air: ['platform.moving', 'saw'], ceiling: ['chain'], bridge: 'platform.collapsing' },
  halloween: { adjective: 'Haunted', floor: ['spikes', 'block'], pit: ['spikes', 'void'], air: ['spikeball', 'saw-sweep', 'platform.disappearing'], ceiling: ['chain', 'crusher'], bridge: 'platform.collapsing' },
  arena: { adjective: 'Grand', floor: ['bounce', 'conveyor', 'crate'], pit: ['spikes', 'void'], air: ['saw', 'platform.moving'], ceiling: ['crusher'], bridge: 'solid' },
};

const THEME_ORDER: ThemeId[] = ['woods', 'desert', 'factory', 'castle', 'winter', 'lava', 'laser', 'western', 'halloween', 'arena'];
const WIDTHS = [28, 30, 32];

function pick<T>(rng: SeededRng, list: readonly T[]): T {
  return list[rng.nextInt(list.length)]!;
}

/** Lasers are authored by their emitter (left end); clamp the beam inside the arena. */
function laserBeam(x1: number, w: number, W: number): { x: number; w: number } {
  const start = Math.max(0.2, Math.min(x1, W - 0.2 - w));
  return { x: start, w: Math.min(w, W - 0.2 - start) };
}

function floorHazard(kind: FloorHazard, s: FloorSlot, rng: SeededRng, W: number): LevelObject[] {
  switch (kind) {
    case 'spikes':
      return [{ type: 'spikes', x: s.x, y: s.top + 0.35, w: s.w, h: 0.5, dir: 'up' }];
    case 'crate':
      return [{ type: 'crate', x: s.x, y: s.top + 0.6, w: 1.1, h: 1.1 }];
    case 'barrel':
      return [{ type: 'barrel.explosive', x: s.x, y: s.top + 0.56, w: 0.8, h: 1.1, hp: 18 }];
    case 'bounce':
      return [{ type: 'bounce', x: s.x, y: s.top + 0.2, w: Math.min(s.w, 1.8), h: 0.4, speed: 18 }];
    case 'ice':
      return [{ type: 'ice', x: s.x, y: s.top + 0.2, w: s.w + 1.5, h: 0.4 }];
    case 'conveyor':
      return [{ type: 'conveyor', x: s.x, y: s.top + 0.2, w: s.w + 1.5, h: 0.4, speed: rng.next() < 0.5 ? 4 : -4 }];
    case 'block':
      return [{ type: 'block.destructible', x: s.x, y: s.top + 0.8, w: Math.min(s.w, 1.6), h: 1.6, hp: 60 }];
    case 'laser-low': {
      const beam = laserBeam(s.x - 2, 4, W);
      return [{ type: 'laser', x: beam.x, y: s.top + 0.9, w: beam.w, onTicks: 30, offTicks: 130, warningTicks: 30, delay: rng.nextInt(60) }];
    }
  }
}

function pitHazard(kind: PitHazard, p: PitSlot): LevelObject[] {
  const w = p.x2 - p.x1;
  const x = (p.x1 + p.x2) / 2;
  switch (kind) {
    case 'void':
      return [];
    case 'spikes':
      return [{ type: 'spikes', x, y: p.floor + 0.35, w: w - 0.4, h: 0.5, dir: 'up' }];
    case 'lava':
      return [{ type: 'lava', x, y: p.floor + 0.6, w, h: 1.2, rate: 0 }];
    case 'lava-rising':
      return [{ type: 'lava', x, y: p.floor + 0.6, w, h: 1.2, rate: 0.03 }];
    case 'saw':
      return [{ type: 'saw', x, y: p.floor + 0.9, r: 0.55, path: [{ x: p.x1 + 1, y: p.floor + 0.9 }, { x: p.x2 - 1, y: p.floor + 0.9 }], speed: 3 }];
  }
}

function airHazard(kind: AirHazard, a: AirSlot, rng: SeededRng, W: number): LevelObject[] {
  switch (kind) {
    case 'saw':
      return [{ type: 'saw', x: a.x, y: a.y, r: 0.55 }];
    case 'saw-sweep':
      return [{ type: 'saw', x: a.x, y: a.y, r: 0.5, path: [{ x: a.x - 2.5, y: a.y }, { x: a.x + 2.5, y: a.y }], speed: 2.5 }];
    case 'spikeball':
      return [{ type: 'spikeball', x: a.x, y: a.y, r: 0.45 }];
    case 'laser': {
      const beam = laserBeam(a.x - 4, 8, W);
      return [{ type: 'laser', x: beam.x, y: a.y - 0.6, w: beam.w, onTicks: 40, offTicks: 110, warningTicks: 30, delay: rng.nextInt(90) }];
    }
    case 'platform.disappearing': {
      // Hung a full head over the surface below: walk-under, and still one hop up.
      const y = a.over + HEADROOM + PLAT_T / 2;
      return [{ type: 'platform.disappearing', x: a.x, y, w: 3, h: PLAT_T, period: 170, delay: rng.nextInt(170) }];
    }
    case 'platform.moving': {
      const y = a.over + HEADROOM + PLAT_T / 2;
      return [{ type: 'platform.moving', x: a.x, y, w: 3, h: PLAT_T, speed: 2.4, path: [{ x: a.x - 2.5, y }, { x: a.x + 2.5, y }] }];
    }
  }
}

function ceilingHazard(kind: CeilingHazard, c: CeilingSlot, rng: SeededRng, W: number): LevelObject[] {
  switch (kind) {
    case 'crusher': {
      const drop = 2.4;
      const h = 0.8;
      // At rest the face sits drop + 0.5 m above the floor; fully down it hovers 0.5 m over it.
      return [{ type: 'crusher', x: c.x, y: c.surfaceTop + 0.5 + drop + h / 2, w: c.w, h, period: 170 + rng.nextInt(60), speed: drop, delay: rng.nextInt(120) }];
    }
    case 'chain':
      return [{ type: 'chain', x: c.x, y: c.surfaceTop + 4.2, links: 6 }];
    case 'laser': {
      const beam = laserBeam(c.x - 3, 6, W);
      return [{ type: 'laser', x: beam.x, y: c.surfaceTop + 2.6, w: beam.w, onTicks: 40, offTicks: 100, warningTicks: 30, delay: rng.nextInt(90) }];
    }
  }
}

function bridgeSegment(kind: BridgeKind, b: BridgeSlot): LevelObject {
  switch (kind) {
    case 'solid':
      return { type: 'solid', x: b.x, y: b.y, w: b.w, h: 0.6 };
    case 'block.destructible':
      return { type: 'block.destructible', x: b.x, y: b.y, w: b.w, h: 0.6, hp: 70 };
    case 'platform.collapsing':
      return { type: 'platform.collapsing', x: b.x, y: b.y, w: b.w, h: 0.5, delay: 75 };
  }
}

/** Outer bridge segments are solid; the middle one is the theme's fragile piece. */
function bridge(theme: ThemeId, segs: BridgeSlot[]): LevelObject[] {
  const mid = Math.floor(segs.length / 2);
  return segs.map((b, i) => bridgeSegment(i === mid ? PALETTES[theme].bridge : 'solid', b));
}

function dress(theme: ThemeId, bp: Blueprint, rng: SeededRng, W: number): LevelObject[] {
  const pal = PALETTES[theme];
  const out = [...bp.objects, ...bridge(theme, bp.bridge)];
  if (bp.pit) out.push(...pitHazard(pick(rng, pal.pit), bp.pit));
  // One or two floor pieces, one air piece, and a ceiling piece on roughly half the arenas.
  const floors = rng.shuffle(bp.floor.slice()).slice(0, bp.floor.length > 2 ? 2 : Math.min(bp.floor.length, 1 + rng.nextInt(2)));
  for (const s of floors) out.push(...floorHazard(pick(rng, pal.floor), s, rng, W));
  const airs = rng.shuffle(bp.air.slice()).slice(0, 1);
  for (const a of airs) out.push(...airHazard(pick(rng, pal.air), a, rng, W));
  if (bp.ceiling.length > 0 && rng.next() < 0.6) out.push(...ceilingHazard(pick(rng, pal.ceiling), pick(rng, bp.ceiling), rng, W));
  return out;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildArena(theme: ThemeId, archetype: Archetype, variant: number): LevelDef {
  const id = `${theme}-${archetype.key}`;
  const rng = new SeededRng(hashSeed(id));
  const W = WIDTHS[(variant + THEME_ORDER.indexOf(theme)) % WIDTHS.length]!;
  const bp = archetype.build(W, H);
  let objects = dress(theme, bp, rng, W);
  let level: LevelDef = {
    id,
    name: `${PALETTES[theme].adjective} ${archetype.name}`,
    theme,
    bounds: { x: 0, y: 0, w: W, h: H },
    killMargin: 6,
    spawns: bp.spawns,
    drops: { enabled: true, xMin: 3, xMax: W - 3, intervalScale: 1 },
    objects,
  };
  // Hazard picks are random; if a roll breaks a rule, re-dress with the bare silhouette's
  // guaranteed-valid pieces only.
  const problems = validateLevel(level);
  if (problems.length > 0) {
    GENERATOR_STATS.fallbacks.push(`${id}: ${problems.join(' | ')}`);
    objects = [...bp.objects, ...bridge(theme, bp.bridge)];
    level = { ...level, objects };
  }
  return level;
}

/** Arenas whose hazard dressing failed validation and shipped as bare silhouettes (should stay empty). */
export const GENERATOR_STATS = { fallbacks: [] as string[] };

/** Seven arenas per theme; each theme rotates through a different slice of the archetypes. */
export function buildArenas(): LevelDef[] {
  const out: LevelDef[] = [];
  THEME_ORDER.forEach((theme, ti) => {
    for (let k = 0; k < 7; k++) {
      const archetype = ARCHETYPES[(ti + k) % ARCHETYPES.length]!;
      out.push(buildArena(theme, archetype, k));
    }
  });
  return out;
}

export const ARCHETYPE_KEYS = ARCHETYPES.map((a) => a.key);
