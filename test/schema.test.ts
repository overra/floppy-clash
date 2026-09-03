import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, builtInMatchLevels, hazardTestLevels } from '../src/levels/catalog';
import { parseLevel } from '../src/sim/level/schema';
import { WEAPON_DEFS } from '../src/sim/weapons/defs';
import { WeaponDefSchema } from '../src/sim/weapons/schema';

describe('schemas', () => {
  it('validates every built-in level', () => {
    expect(ALL_LEVELS.length).toBeGreaterThanOrEqual(60);
    expect(builtInMatchLevels().length).toBeGreaterThanOrEqual(30);
    for (const level of ALL_LEVELS) {
      expect(() => parseLevel(level)).not.toThrow();
      expect(level.spawns.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('has a test level per hazard type', () => {
    const ids = hazardTestLevels().map((l) => l.id);
    for (const kind of [
      'spikes',
      'lava',
      'saw',
      'platform.moving',
      'crate',
      'ice',
      'conveyor',
      'laser',
      'chain',
      'crusher',
    ]) {
      expect(ids.some((id) => id.includes(kind))).toBe(true);
    }
  });

  it('validates the full weapon roster', () => {
    expect(WEAPON_DEFS.length).toBeGreaterThanOrEqual(36);
    for (const def of WEAPON_DEFS) {
      expect(() => WeaponDefSchema.parse(def)).not.toThrow();
    }
  });
});
