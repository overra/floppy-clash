import type { LevelDef, LevelObject } from '../sim/level/schema';
import { tuning } from '../sim/tuning';

/**
 * Movement envelope shared by the level validator and the bot navigator. Derived from the
 * controller tuning so a change to jump height or run speed automatically re-grades every level.
 */
const JUMP_APEX = (tuning.jumpSpeed * tuning.jumpSpeed) / (2 * tuning.gravity);

export const REACH = {
  /** Highest ledge (feet-to-top) a single jump lands on with margin: the apex (v²/2g ≈ 3.1 m) less 0.4 m. */
  MAX_RISE: Math.floor((JUMP_APEX - 0.4) * 100) / 100,
  /** Tallest wall a chain of wall-jumps climbs (measured against bots in the sim). */
  MAX_WALL_CLIMB: 3.2,
  /** Furthest horizontal hop, regardless of drop height. */
  MAX_GAP: 6.5,
  /**
   * Air a fighter needs to walk under something: the 1.8 m capsule plus a head's worth of room.
   * Anything hanging lower than this over a surface (but not resting on it) is a head-bump.
   */
  HEADROOM: 2.2,
};

/**
 * Horizontal distance a running jump covers while still being able to land on a surface
 * `rise` metres above (negative = below) the launch surface. Uses the later of the two times
 * the jump arc crosses that height, minus a landing margin.
 */
export function gapAllowed(rise: number): number {
  const v = tuning.jumpSpeed;
  const g = tuning.gravity;
  const disc = v * v - 2 * g * rise;
  if (disc < 0) return 0;
  const tLate = (v + Math.sqrt(disc)) / g;
  return Math.max(0, Math.min(REACH.MAX_GAP, 0.85 * tuning.runSpeed * tLate - 0.6));
}

export type Surface = { x1: number; x2: number; top: number; bottom: number; type: string; index: number };

/**
 * How one surface is reached from another; `launchX` is on `from`, `landX` on `to`. When a
 * ledge can be climbed from either side, `alt` is the other approach.
 */
export type Hop = { launchX: number; landX: number; rise: number; wall: boolean; alt?: Hop };

const STANDABLE = new Set([
  'solid',
  'platform.moving',
  'platform.disappearing',
  'platform.collapsing',
  'platform.rotating',
  'conveyor',
  'bounce',
  'crate',
  'block.destructible',
]);

/** Fixed geometry a route may rely on: crates get pushed, destructibles get shot, movers move. */
const STATIC = new Set(['solid', 'conveyor', 'bounce']);

const DEADLY = new Set(['spikes', 'lava', 'saw', 'spikeball', 'laser', 'crusher']);
const TEMPORARY = new Set(['platform.disappearing', 'platform.collapsing']);

function box(obj: LevelObject): { x1: number; x2: number; y1: number; y2: number } {
  if (obj.type === 'laser') {
    // Lasers are authored by their emitter; the beam runs to the right for `w`.
    return { x1: obj.x, x2: obj.x + (obj.w ?? 14), y1: obj.y - 0.2, y2: obj.y + 0.2 };
  }
  const w = obj.w ?? (obj.r ? obj.r * 2 : 1);
  const h = obj.h ?? (obj.r ? obj.r * 2 : 1);
  return { x1: obj.x - w / 2, x2: obj.x + w / 2, y1: obj.y - h / 2, y2: obj.y + h / 2 };
}

export type Box = { x1: number; x2: number; y1: number; y2: number };

/**
 * Footprint of a hazard that kills on touch and never moves out of the way: the volume a route
 * must jump over or steer around. Sweeping saws cover their whole path; timed hazards (lasers,
 * crushers) are dodged by waiting, not by routing, so they cast no footprint.
 */
export function deadlyFootprint(obj: LevelObject): Box | null {
  if (obj.type === 'spikes' || obj.type === 'lava') return box(obj);
  if (obj.type === 'saw' || obj.type === 'spikeball') {
    const r = obj.r ?? 0.5;
    const pts = obj.path && obj.path.length > 0 ? obj.path : [{ x: obj.x, y: obj.y }];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x1: Math.min(...xs) - r, x2: Math.max(...xs) + r, y1: Math.min(...ys) - r, y2: Math.max(...ys) + r };
  }
  return null;
}

/** Every fixed kill volume in the level (see `deadlyFootprint`). */
export function deadlyFootprints(level: LevelDef): Box[] {
  return level.objects.flatMap((o) => {
    const f = deadlyFootprint(o);
    return f ? [f] : [];
  });
}

export function surfacesOf(level: LevelDef, staticOnly = false): Surface[] {
  const out: Surface[] = [];
  const ceiling = level.bounds.y + level.bounds.h - 0.5;
  const blockers = level.objects.map((o, i) => ({ i, type: o.type, ...box(o) })).filter((o) => o.type === 'solid');
  const deadly = deadlyFootprints(level);
  level.objects.forEach((obj, index) => {
    if (!(staticOnly ? STATIC : STANDABLE).has(obj.type)) return;
    const b = box(obj);
    // Boundary walls run to the ceiling; their tops are not play space.
    if (b.x2 - b.x1 < 0.6 || b.y2 >= ceiling) return;
    // A solid standing on (or hanging low over) this surface splits it into separately-walkable
    // stretches: you cannot stroll through a tower, and the graph must route around it. A spike
    // strip or saw sweep resting on the surface splits it the same way, with a landing margin,
    // so the graph's hops carry walkers over the hazard instead of through it.
    const cuts = [
      ...blockers
        .filter((o) => o.i !== index && o.x1 < b.x2 - 0.05 && o.x2 > b.x1 + 0.05 && o.y1 < b.y2 + REACH.HEADROOM - 0.05 && o.y2 > b.y2 + 0.8)
        .map((o) => [Math.max(b.x1, o.x1), Math.min(b.x2, o.x2)] as const),
      ...deadly
        .filter((o) => o.x1 < b.x2 - 0.05 && o.x2 > b.x1 + 0.05 && o.y1 < b.y2 + 1.6 && o.y2 > b.y2 - 0.2)
        .map((o) => [Math.max(b.x1, o.x1 - 0.4), Math.min(b.x2, o.x2 + 0.4)] as const),
    ].sort((p, q) => p[0] - q[0]);
    let cursor = b.x1;
    for (const [c1, c2] of cuts) {
      if (c1 - cursor >= 0.6) out.push({ x1: cursor, x2: c1, top: b.y2, bottom: b.y1, type: obj.type, index });
      cursor = Math.max(cursor, c2);
    }
    if (b.x2 - cursor >= 0.6) out.push({ x1: cursor, x2: b.x2, top: b.y2, bottom: b.y1, type: obj.type, index });
  });
  return out;
}

export function isWall(s: Surface): boolean {
  return s.top - s.bottom > 3 && s.x2 - s.x1 < 4;
}

/**
 * Can a player standing on `from` get onto `to`? Rising needs a launch spot on `from` that is
 * not underneath `to` (you cannot jump through a floor) within the arc's horizontal reach of
 * `to`'s nearest edge; dropping only needs one edge of `from` within falling reach of `to`.
 */
export function hopBetween(from: Surface, to: Surface): Hop | null {
  if (from === to) return null;
  const rise = to.top - from.top;
  const inset = 0.35;

  if (rise > 0.05) {
    let best: Hop | null = null;
    // Approach from the left of `to`.
    if (from.x1 + inset < to.x1 - 0.2) {
      const launchX = Math.min(from.x2 - inset, to.x1 - 0.45);
      const gap = to.x1 - launchX;
      const landX = to.x1 + Math.min(0.5, (to.x2 - to.x1) / 2);
      const climb = isWall(to) && gap < 1.5 && rise <= REACH.MAX_WALL_CLIMB;
      if (climb || (rise <= REACH.MAX_RISE && gap <= gapAllowed(rise))) best = { launchX, landX, rise, wall: climb && rise > REACH.MAX_RISE };
    }
    // Approach from the right of `to`.
    if (from.x2 - inset > to.x2 + 0.2) {
      const launchX = Math.max(from.x1 + inset, to.x2 + 0.45);
      const gap = launchX - to.x2;
      const landX = to.x2 - Math.min(0.5, (to.x2 - to.x1) / 2);
      const climb = isWall(to) && gap < 1.5 && rise <= REACH.MAX_WALL_CLIMB;
      if (climb || (rise <= REACH.MAX_RISE && gap <= gapAllowed(rise))) {
        const right: Hop = { launchX, landX, rise, wall: climb && rise > REACH.MAX_RISE };
        if (!best) best = right;
        else if (gap + 1e-6 < to.x1 - best.launchX) best = { ...right, alt: best };
        else best.alt = right;
      }
    }
    return best;
  }

  // Level or below: overlap means you can step/drop straight onto it from the overlapping stretch.
  const o1 = Math.max(from.x1, to.x1);
  const o2 = Math.min(from.x2, to.x2);
  if (rise <= 0.05 && rise > -0.05 && o1 < o2) {
    const x = (o1 + o2) / 2;
    return { launchX: x, landX: x, rise, wall: false };
  }
  const reach = gapAllowed(rise);
  const edges: Hop[] = [];
  // Off the left edge of `from` toward `to`.
  {
    const launchX = from.x1 + inset;
    const gap = Math.max(0, to.x1 - launchX, launchX - to.x2);
    if (to.x1 < from.x1 + 0.2 && gap <= reach) edges.push({ launchX, landX: Math.min(Math.max(launchX - 0.6, to.x1 + 0.3), to.x2 - 0.3), rise, wall: false });
  }
  {
    const launchX = from.x2 - inset;
    const gap = Math.max(0, to.x1 - launchX, launchX - to.x2);
    if (to.x2 > from.x2 - 0.2 && gap <= reach) edges.push({ launchX, landX: Math.max(Math.min(launchX + 0.6, to.x2 - 0.3), to.x1 + 0.3), rise, wall: false });
  }
  if (edges.length === 0) return null;
  return edges.length === 1 ? edges[0]! : edges.reduce((a, b) => (Math.abs(a.landX - a.launchX) <= Math.abs(b.landX - b.launchX) ? a : b));
}

export function canTraverse(from: Surface, to: Surface): boolean {
  return hopBetween(from, to) !== null;
}

/** Surfaces nobody can get to (unreachable) or get off (stranded) via legal hops. */
export function reachability(level: LevelDef): { unreachable: Surface[]; stranded: Surface[] } {
  const surfaces = surfacesOf(level, true);
  const n = surfaces.length;
  if (n === 0) return { unreachable: [], stranded: [] };
  const adj: number[][] = surfaces.map(() => []);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) if (a !== b && canTraverse(surfaces[a]!, surfaces[b]!)) adj[a]!.push(b);
  }
  const floorIdx = surfaces.reduce((best, s, i) => (s.x2 - s.x1 > surfaces[best]!.x2 - surfaces[best]!.x1 ? i : best), 0);
  const forward = bfs(adj, floorIdx);
  const rev: number[][] = surfaces.map(() => []);
  for (let a = 0; a < n; a++) for (const b of adj[a]!) rev[b]!.push(a);
  const backward = bfs(rev, floorIdx);
  return {
    unreachable: surfaces.filter((_, i) => !forward.has(i)),
    stranded: surfaces.filter((_, i) => !backward.has(i)),
  };
}

function bfs(adj: number[][], start: number): Set<number> {
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    for (const v of adj[queue[qi]!]!) {
      if (!seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  return seen;
}

/** Footprint of an object over its whole path (movers sweep; everything else is its box). */
function sweptBox(obj: LevelObject): { x1: number; x2: number; y1: number; y2: number } {
  const b = box(obj);
  if (!obj.path || obj.path.length === 0) return b;
  const hw = (b.x2 - b.x1) / 2;
  const hh = (b.y2 - b.y1) / 2;
  const xs = [obj.x, ...obj.path.map((p) => p.x)];
  const ys = [obj.y, ...obj.path.map((p) => p.y)];
  return { x1: Math.min(...xs) - hw, x2: Math.max(...xs) + hw, y1: Math.min(...ys) - hh, y2: Math.max(...ys) + hh };
}

/**
 * Head-bumps: a standable piece hanging over another walkable surface with less than HEADROOM of
 * air, without resting on it. Fighters walk into these and stall; the floating platforms of an
 * arena should either clear a head or sit on the ground. Gaps completely filled by a third piece
 * (stacked terraces) are judged pair by pair. Movers are checked along their whole path, and a
 * mover that ploughs through a solid is reported as well.
 */
export function headroomProblems(level: LevelDef): string[] {
  const out: string[] = [];
  const ceiling = level.bounds.y + level.bounds.h - 0.5;
  // Crates are loose props (they get shoved and stacked); only the built geometry is judged.
  const pieces = level.objects
    .map((o, i) => ({ i, type: o.type, moves: !!o.path?.length, ...sweptBox(o) }))
    .filter((o) => STANDABLE.has(o.type) && o.type !== 'crate');
  for (const below of pieces) {
    if (below.y2 >= ceiling || below.x2 - below.x1 < 0.6) continue;
    for (const above of pieces) {
      if (above === below) continue;
      const x1 = Math.max(below.x1, above.x1);
      const x2 = Math.min(below.x2, above.x2);
      if (x2 - x1 < 0.3) continue;
      const gap = above.y1 - below.y2;
      const where = `x ${x1.toFixed(1)}–${x2.toFixed(1)}`;
      if (gap < -0.05 && above.y2 > below.y1 + 0.05 && above.moves !== below.moves && (above.type === 'solid' || below.type === 'solid')) {
        const mover = above.moves ? above : below;
        const solid = above.moves ? below : above;
        out.push(`${mover.type} #${mover.i} sweeps through ${solid.type} #${solid.i} (${where})`);
        continue;
      }
      if (gap <= 0.5 || gap >= REACH.HEADROOM - 1e-6) continue;
      const filled = pieces.some(
        (m) => m !== below && m !== above && m.x1 <= x1 + 0.05 && m.x2 >= x2 - 0.05 && m.y1 < above.y1 - 0.05 && m.y2 > below.y2 + 0.05,
      );
      if (filled) continue;
      out.push(`${above.type} #${above.i} hangs ${gap.toFixed(2)} m over ${below.type} #${below.i} (${where}): needs ${REACH.HEADROOM} m of headroom or to sit on it`);
    }
  }
  return out;
}

/** Returns human-readable rule violations; an empty list means the level passes. */
export function validateLevel(level: LevelDef): string[] {
  const problems: string[] = [];
  const b = level.bounds;
  const surfaces = surfacesOf(level);

  for (const obj of level.objects) {
    const bb = box(obj);
    if (bb.x1 < b.x - 0.01 || bb.x2 > b.x + b.w + 0.01 || bb.y1 < b.y - 0.01 || bb.y2 > b.y + b.h + 0.01) {
      problems.push(`${obj.type} at (${obj.x}, ${obj.y}) leaves the bounds`);
    }
  }

  level.spawns.forEach((sp, i) => {
    const under = surfaces
      .filter((s) => sp.x >= s.x1 - 0.2 && sp.x <= s.x2 + 0.2 && s.top <= sp.y + 0.05)
      .sort((p, q) => q.top - p.top)[0];
    if (!under) {
      problems.push(`spawn ${i} at (${sp.x}, ${sp.y}) has no floor beneath it`);
      return;
    }
    if (sp.y - under.top > 3) problems.push(`spawn ${i} drops ${(sp.y - under.top).toFixed(1)} m onto its floor`);
    if (DEADLY.has(under.type) || TEMPORARY.has(under.type)) problems.push(`spawn ${i} stands on ${under.type}`);
    for (const obj of level.objects) {
      if (!DEADLY.has(obj.type)) continue;
      const hb = box(obj);
      const nearX = sp.x > hb.x1 - 1.4 && sp.x < hb.x2 + 1.4;
      const nearY = sp.y > hb.y1 - 2.2 && sp.y < hb.y2 + 1.0;
      if (obj.type === 'laser') {
        const beamY = obj.y;
        if (nearX && Math.abs(sp.y - beamY) < 0.6) problems.push(`spawn ${i} stands in the laser line at y=${beamY}`);
        continue;
      }
      if (nearX && nearY) problems.push(`spawn ${i} is ${obj.type}-adjacent at (${obj.x}, ${obj.y})`);
    }
  });

  const { unreachable, stranded } = reachability(level);
  for (const s of unreachable) problems.push(`${s.type} spanning x ${s.x1}-${s.x2} at top ${s.top} cannot be reached`);
  for (const s of stranded) problems.push(`${s.type} spanning x ${s.x1}-${s.x2} at top ${s.top} is a dead end`);

  problems.push(...headroomProblems(level));

  return problems;
}
