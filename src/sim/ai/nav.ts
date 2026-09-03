import { deadlyFootprints, hopBetween, surfacesOf, type Box, type Hop, type Surface } from '../../levels/validate';
import type { LevelDef } from '../level/schema';

/**
 * Static surface graph for bot navigation. Nodes are standable static surfaces; an edge exists
 * when `hopBetween` says a running jump (or wall climb) gets from one to the other. Routing is
 * an all-pairs next-hop table, cheap because arenas have a couple dozen surfaces at most.
 * `deadly` lists the fixed kill volumes (spike strips, saw sweeps) a flight path must avoid.
 */
export type NavGraph = {
  surfaces: Surface[];
  hops: (Hop | null)[][];
  next: Int16Array;
  deadly: Box[];
};

const cache = new WeakMap<LevelDef, NavGraph>();

export function navFor(level: LevelDef): NavGraph {
  const hit = cache.get(level);
  if (hit) return hit;
  const surfaces = surfacesOf(level, true);
  const deadly = deadlyFootprints(level);
  const n = surfaces.length;
  const hops: (Hop | null)[][] = surfaces.map(() => new Array<Hop | null>(n).fill(null));
  const adj: number[][] = surfaces.map(() => []);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const hop = hopBetween(surfaces[a]!, surfaces[b]!);
      hops[a]![b] = hop;
      if (hop) adj[a]!.push(b);
    }
  }
  const next = new Int16Array(n * n).fill(-1);
  for (let s = 0; s < n; s++) {
    const parent = new Int32Array(n).fill(-1);
    parent[s] = s;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi]!;
      for (const v of adj[u]!) {
        if (parent[v] === -1) {
          parent[v] = u;
          queue.push(v);
        }
      }
    }
    for (let d = 0; d < n; d++) {
      if (d === s || parent[d] === -1) continue;
      let cur = d;
      while (parent[cur] !== s) cur = parent[cur]!;
      next[s * n + d] = cur;
    }
  }
  const graph = { surfaces, hops, next, deadly };
  cache.set(level, graph);
  return graph;
}

/** Index of the surface a body with its feet at `feetY` is standing on (or hovering just above). */
export function surfaceUnderFeet(nav: NavGraph, x: number, feetY: number, tolerance = 0.6): number {
  let best = -1;
  let bestTop = -Infinity;
  for (let i = 0; i < nav.surfaces.length; i++) {
    const s = nav.surfaces[i]!;
    if (x < s.x1 - 0.3 || x > s.x2 + 0.3) continue;
    if (s.top > feetY + 0.25 || feetY - s.top > tolerance) continue;
    if (s.top > bestTop) {
      bestTop = s.top;
      best = i;
    }
  }
  return best;
}

/** Highest static surface somewhere below a point (what an airborne target will land on). */
export function surfaceBelow(nav: NavGraph, x: number, feetY: number, maxDrop = 8): number {
  let best = -1;
  let bestTop = -Infinity;
  for (let i = 0; i < nav.surfaces.length; i++) {
    const s = nav.surfaces[i]!;
    if (x < s.x1 - 0.2 || x > s.x2 + 0.2) continue;
    if (s.top > feetY + 0.25 || feetY - s.top > maxDrop) continue;
    if (s.top > bestTop) {
      bestTop = s.top;
      best = i;
    }
  }
  return best;
}

export type LandingTuning = { gravity: number; runSpeed: number; airAccelTicks: number; tickRate: number; maxFallSpeed: number; height: number };

export type Landing = {
  x: number;
  feet: number;
  /** Static surface the body comes down on, or -1 when nothing catches it within ~2 s (a pit, the void, a spike strip cut from the graph). */
  surf: number;
  /** The body brushed a fixed kill volume on the way. */
  deadly: boolean;
};

/**
 * Where a body in flight comes down if it holds `moveX` from here: the arc is integrated against
 * the static surface tops, sweeping a slightly slimmed body box through the level's fixed kill
 * volumes so clipping the end of a spike strip or rising into a saw counts as a bad flight.
 */
export function predictLanding(
  nav: NavGraph,
  x: number,
  feet: number,
  vx: number,
  vy: number,
  moveX: number,
  tune: LandingTuning,
  /** Transient kill bands (a laser that is firing or about to), tested against the body's centre. */
  bands: Box[] = [],
): Landing {
  const dt = 2 / tune.tickRate;
  const accel = (tune.runSpeed / tune.airAccelTicks) * tune.tickRate;
  const want = moveX * tune.runSpeed;
  const halfW = 0.22;
  const half = tune.height / 2;
  for (let i = 0; i < tune.tickRate; i++) {
    vx += Math.max(-accel * dt, Math.min(accel * dt, want - vx));
    vy = Math.max(-tune.maxFallSpeed, vy - tune.gravity * dt);
    const nx = x + vx * dt;
    const nfeet = feet + vy * dt;
    for (const b of nav.deadly) {
      if (nx + halfW > b.x1 && nx - halfW < b.x2 && nfeet + tune.height - 0.1 > b.y1 && nfeet + 0.1 < b.y2) return { x: nx, feet: nfeet, surf: -1, deadly: true };
    }
    for (const b of bands) {
      const cy = nfeet + half;
      if (nx > b.x1 && nx < b.x2 && cy > b.y1 && cy < b.y2) return { x: nx, feet: nfeet, surf: -1, deadly: true };
    }
    if (vy < 0) {
      for (let s = 0; s < nav.surfaces.length; s++) {
        const sf = nav.surfaces[s]!;
        if (nx >= sf.x1 - 0.15 && nx <= sf.x2 + 0.15 && feet >= sf.top - 0.05 && nfeet <= sf.top) return { x: nx, feet: sf.top, surf: s, deadly: false };
      }
    }
    x = nx;
    feet = nfeet;
  }
  return { x, feet, surf: -1, deadly: false };
}

/** Next hop on the route from surface `a` to surface `b`, or null when unreachable. */
export function routeStep(nav: NavGraph, a: number, b: number): { to: number; hop: Hop } | null {
  const n = nav.surfaces.length;
  // Indices remembered from a previous arena are meaningless here; treat them as "nowhere".
  if (a < 0 || b < 0 || a >= n || b >= n || a === b) return null;
  const to = nav.next[a * n + b]!;
  if (to < 0) return null;
  const hop = nav.hops[a]![to];
  return hop ? { to, hop } : null;
}
