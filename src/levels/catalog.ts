import { gymLevel, runTrack } from './gym';
import { castleKeep, desertStack, factoryLine, woodsClearing, woodsRidge } from './handauthored';
import { GENERATED_LEVELS } from './generated';
import type { LevelDef } from '../sim/level/schema';
import { parseLevel } from '../sim/level/schema';

export const HAND_AUTHORED: LevelDef[] = [
  woodsClearing,
  woodsRidge,
  desertStack,
  factoryLine,
  castleKeep,
];

function uniquify(levels: LevelDef[]): LevelDef[] {
  const used = new Set<string>();
  return levels.map((level) => {
    if (!used.has(level.id)) {
      used.add(level.id);
      return parseLevel(level);
    }
    const slug = `${level.theme}-${level.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/g, '');
    let id = slug;
    let n = 2;
    while (used.has(id)) {
      id = `${slug}-${n}`;
      n += 1;
    }
    used.add(id);
    return parseLevel({ ...level, id });
  });
}

export const ALL_LEVELS: LevelDef[] = uniquify([gymLevel, runTrack, ...HAND_AUTHORED, ...GENERATED_LEVELS]);

const byId = new Map(ALL_LEVELS.map((l) => [l.id, l]));

export function getLevel(id: string): LevelDef {
  const level = byId.get(id);
  if (!level) throw new Error(`Unknown level ${id}`);
  return level;
}

export function levelsForThemes(themes: string[]): LevelDef[] {
  return ALL_LEVELS.filter((l) => themes.includes(l.theme) && isMatchLevel(l));
}

export function isMatchLevel(level: LevelDef): boolean {
  return !level.id.startsWith('test-') && level.id !== 'gym' && level.id !== 'run-track';
}

export function builtInMatchLevels(): LevelDef[] {
  return ALL_LEVELS.filter(isMatchLevel);
}

/**
 * Built-in match arenas plus optional user-library levels.
 * User extras stay in the pool when the host only toggled built-ins
 * (PLAN 4.15 — include-user-levels is not wiped by a partial built-in list).
 * Once any extra id is listed in `enabled`, extras are filtered like built-ins.
 */
export function matchLevelPool(enabled: string[] | 'all', extra: LevelDef[] = []): LevelDef[] {
  const seen = new Set<string>();
  const out: LevelDef[] = [];
  const extraIds = new Set(extra.map((l) => l.id));
  const extrasToggled = enabled !== 'all' && extra.some((e) => enabled.includes(e.id));
  for (const level of [...builtInMatchLevels(), ...extra]) {
    if (seen.has(level.id)) continue;
    if (enabled !== 'all') {
      const isExtra = extraIds.has(level.id);
      if (isExtra) {
        if (extrasToggled && !enabled.includes(level.id)) continue;
      } else if (!enabled.includes(level.id)) {
        continue;
      }
    }
    seen.add(level.id);
    out.push(level);
  }
  return out;
}

export function hazardTestLevels(): LevelDef[] {
  return ALL_LEVELS.filter((l) => l.id.startsWith('test-'));
}

export { gymLevel, runTrack };
