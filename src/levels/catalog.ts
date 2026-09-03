import { gymLevel } from './gym';
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

export const ALL_LEVELS: LevelDef[] = [gymLevel, ...HAND_AUTHORED, ...GENERATED_LEVELS].map((l) =>
  parseLevel(l),
);

const byId = new Map(ALL_LEVELS.map((l) => [l.id, l]));

export function getLevel(id: string): LevelDef {
  const level = byId.get(id);
  if (!level) throw new Error(`Unknown level ${id}`);
  return level;
}

export function levelsForThemes(themes: string[]): LevelDef[] {
  return ALL_LEVELS.filter((l) => themes.includes(l.theme) && !l.id.startsWith('test-') && l.id !== 'gym');
}

export function builtInMatchLevels(): LevelDef[] {
  return ALL_LEVELS.filter((l) => !l.id.startsWith('test-') && l.id !== 'gym');
}

export function hazardTestLevels(): LevelDef[] {
  return ALL_LEVELS.filter((l) => l.id.startsWith('test-'));
}

export { gymLevel };
