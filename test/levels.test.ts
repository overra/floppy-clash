import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, builtInMatchLevels, hazardTestLevels } from '../src/levels/catalog';

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

  it('ships a per-hazard test level', () => {
    const tests = hazardTestLevels();
    expect(tests.length).toBeGreaterThanOrEqual(16);
    expect(ALL_LEVELS.length).toBeGreaterThanOrEqual(60);
  });
});
