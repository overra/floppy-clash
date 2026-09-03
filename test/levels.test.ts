import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, builtInMatchLevels, hazardTestLevels, matchLevelPool } from '../src/levels/catalog';

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
    const fingerprints = match.map(
      (l) => `${l.theme}|${l.objects.map((o) => `${o.type}:${o.x.toFixed(1)},${o.y.toFixed(1)}`).join(';')}`,
    );
    expect(new Set(fingerprints).size).toBe(match.length);
  });

  it('filters user levels into the match pool', () => {
    const extra = [{ ...builtInMatchLevels()[0]!, id: 'user-arena', name: 'User Arena' }];
    const pool = matchLevelPool('all', extra);
    expect(pool.some((l) => l.id === 'user-arena')).toBe(true);
    const subset = matchLevelPool(['user-arena'], extra);
    expect(subset.map((l) => l.id)).toEqual(['user-arena']);
    const builtInOnly = matchLevelPool(['woods-01'], extra);
    expect(builtInOnly.some((l) => l.id === 'woods-01')).toBe(true);
    expect(builtInOnly.some((l) => l.id === 'user-arena')).toBe(true);
  });

  it('ships a per-hazard test level', () => {
    const tests = hazardTestLevels();
    expect(tests.length).toBeGreaterThanOrEqual(17);
    expect(tests.some((l) => l.id === 'test-void')).toBe(true);
    expect(ALL_LEVELS.length).toBeGreaterThanOrEqual(60);
  });
});
