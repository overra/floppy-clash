import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, builtInMatchLevels, hazardTestLevels, matchLevelPool } from '../src/levels/catalog';
import { ARCHETYPE_KEYS, GENERATOR_STATS } from '../src/levels/generator';
import { REACH, gapAllowed, headroomProblems, hopBetween, surfacesOf, validateLevel, type Surface } from '../src/levels/validate';

const surf = (x1: number, x2: number, top: number, thick = 0.6): Surface => ({ x1, x2, top, bottom: top - thick, type: 'solid', index: 0 });

describe('level validator', () => {
  it('grades hops from the controller tuning: level gaps are long, high ledges are short', () => {
    expect(gapAllowed(0)).toBeGreaterThan(5);
    expect(gapAllowed(2.5)).toBeLessThan(gapAllowed(0));
    expect(gapAllowed(2.5)).toBeGreaterThan(3);
    expect(gapAllowed(3.5)).toBe(0);
  });

  it('needs standing room beside a ledge to jump onto it', () => {
    const floor = surf(0, 20, 2, 2);
    const ledge = surf(6, 10, 4.2);
    const hop = hopBetween(floor, ledge);
    expect(hop).not.toBeNull();
    expect(hop!.launchX).toBeLessThan(6);
    expect(hop!.landX).toBeGreaterThan(6);
    // A ledge wider than everything under it cannot be jumped onto from below.
    expect(hopBetween(surf(6, 10, 2), surf(0, 20, 4))).toBeNull();
    // Too high for a single jump, too wide to be a wall.
    expect(hopBetween(floor, surf(6, 12, 5.5))).toBeNull();
    // Dropping down is always fine when the lower surface is within reach of an edge.
    expect(hopBetween(ledge, floor)).not.toBeNull();
  });

  it('splits a floor where a tower stands on it', () => {
    const level = {
      ...builtInMatchLevels()[0]!,
      bounds: { x: 0, y: 0, w: 20, h: 18 },
      objects: [
        { type: 'solid' as const, x: 10, y: 1, w: 20, h: 2 },
        { type: 'solid' as const, x: 10, y: 4, w: 2, h: 6 },
      ],
    };
    const floors = surfacesOf(level, true).filter((s) => s.index === 0);
    expect(floors.map((s) => [s.x1, s.x2])).toEqual([
      [0, 9],
      [11, 20],
    ]);
  });

  it('splits a floor at a spike strip so routes hop over it, but not under a saw hanging high above', () => {
    const level = {
      ...builtInMatchLevels()[0]!,
      bounds: { x: 0, y: 0, w: 20, h: 18 },
      objects: [
        { type: 'solid' as const, x: 10, y: 1, w: 20, h: 2 },
        { type: 'spikes' as const, x: 10, y: 2.35, w: 2, h: 0.5, dir: 'up' as const },
        { type: 'saw' as const, x: 5, y: 7, r: 0.5 },
      ],
    };
    const floors = surfacesOf(level, true);
    expect(floors.map((s) => [s.x1, s.x2])).toEqual([
      [0, 8.6],
      [11.4, 20],
    ]);
    const hop = hopBetween(floors[0]!, floors[1]!);
    expect(hop).not.toBeNull();
    expect(hop!.launchX).toBeLessThan(8.6);
    expect(hop!.landX).toBeGreaterThan(11.4);
  });

  it('flags platforms hung too low to walk under, but not stacked terraces or a mover that clears a head', () => {
    const base = { ...builtInMatchLevels()[0]!, bounds: { x: 0, y: 0, w: 20, h: 18 }, spawns: [{ x: 3, y: 3.5 }] };
    const floor = { type: 'solid' as const, x: 10, y: 1, w: 20, h: 2 };
    // 1.8 m of air: exactly a fighter's height, so the head hits it.
    const low = { ...base, objects: [floor, { type: 'solid' as const, x: 10, y: 4.1, w: 4, h: 0.6 }] };
    expect(headroomProblems(low)).toHaveLength(1);
    expect(headroomProblems(low)[0]).toMatch(/hangs 1.80 m/);
    // Raised so REACH.HEADROOM of air is left: fine, and still a single hop up.
    const clear = { ...base, objects: [floor, { type: 'solid' as const, x: 10, y: 2 + REACH.HEADROOM + 0.2, w: 4, h: 0.4 }] };
    expect(headroomProblems(clear)).toEqual([]);
    expect(validateLevel(clear)).toEqual([]);
    // Terraces stacked directly on one another leave no gap to walk into.
    const terraces = { ...base, objects: [floor, { type: 'solid' as const, x: 3, y: 2.9, w: 6, h: 1.8 }, { type: 'solid' as const, x: 2, y: 4.7, w: 4, h: 1.8 }] };
    expect(headroomProblems(terraces)).toEqual([]);
    // A mover is judged along its whole path: it dips under the ledge with 1.4 m of air at one end.
    const mover = {
      ...base,
      objects: [floor, { type: 'solid' as const, x: 15, y: 5.2, w: 4, h: 0.4 }, { type: 'platform.moving' as const, x: 8, y: 3.4, w: 2, h: 0.4, speed: 2, path: [{ x: 6, y: 3.4 }, { x: 14, y: 3.4 }] }],
    };
    expect(headroomProblems(mover).some((p) => p.includes('platform.moving'))).toBe(true);
    // ...and one that ploughs through a wall is called out as such.
    const through = { ...base, objects: [floor, { type: 'solid' as const, x: 12, y: 4, w: 1, h: 4 }, { type: 'platform.moving' as const, x: 8, y: 3.4, w: 2, h: 0.4, speed: 2, path: [{ x: 6, y: 3.4 }, { x: 14, y: 3.4 }] }] };
    expect(headroomProblems(through).some((p) => p.includes('sweeps through'))).toBe(true);
  });

  it('every built-in match level passes and no generated arena fell back to a bare silhouette', () => {
    const failures = builtInMatchLevels()
      .map((l) => ({ id: l.id, problems: validateLevel(l) }))
      .filter((r) => r.problems.length > 0);
    expect(failures).toEqual([]);
    expect(GENERATOR_STATS.fallbacks).toEqual([]);
  });

  it('covers every archetype and theme with a distinct hazard dressing', () => {
    const match = builtInMatchLevels();
    for (const key of ARCHETYPE_KEYS) expect(match.some((l) => l.id.endsWith(`-${key}`))).toBe(true);
    const dressed = match.filter((l) => l.objects.some((o) => o.type !== 'solid'));
    expect(dressed.length).toBeGreaterThanOrEqual(match.length - 2);
  });
});

describe('levels catalog', () => {
  it('has 60+ unique match levels and 30+ across the six v1 themes', () => {
    const match = builtInMatchLevels();
    const ids = new Set(match.map((l) => l.id));
    expect(ids.size).toBe(match.length);
    expect(match.length).toBeGreaterThanOrEqual(60);
    const v1 = match.filter((l) =>
      ['woods', 'desert', 'factory', 'castle', 'lava', 'winter'].includes(l.theme),
    );
    expect(v1.length).toBeGreaterThanOrEqual(30);
    const later = match.filter((l) => ['laser', 'western', 'halloween'].includes(l.theme));
    expect(later.length).toBeGreaterThanOrEqual(15);
  });

  it('filters user levels into the match pool', () => {
    const extra = [{ ...builtInMatchLevels()[0]!, id: 'user-arena', name: 'User Arena' }];
    const pool = matchLevelPool('all', extra);
    expect(pool.some((l) => l.id === 'user-arena')).toBe(true);
    const subset = matchLevelPool(['user-arena'], extra);
    expect(subset.map((l) => l.id)).toEqual(['user-arena']);
  });

  it('ships a per-hazard test level', () => {
    const tests = hazardTestLevels();
    expect(tests.length).toBeGreaterThanOrEqual(16);
    expect(ALL_LEVELS.length).toBeGreaterThanOrEqual(60);
  });
});
