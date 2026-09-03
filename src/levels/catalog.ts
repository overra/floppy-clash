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

export function hazardTestLevels(): LevelDef[] {
  return ALL_LEVELS.filter((l) => l.id.startsWith('test-'));
}

export { gymLevel, runTrack };
