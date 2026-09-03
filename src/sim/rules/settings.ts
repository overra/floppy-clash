export type LevelRotation = 'random' | 'ordered';

export interface MatchSettings {
  maxHp: number;
  firstTo: number;
  showWins: boolean;
  rotation: LevelRotation;
  enabledWeapons: string[] | 'all';
  enabledLevels: string[] | 'all';
  playerCount: number;
  bots: number;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  maxHp: 100,
  firstTo: 0,
  showWins: true,
  rotation: 'random',
  enabledWeapons: 'all',
  enabledLevels: 'all',
  playerCount: 2,
  bots: 0,
};

export function mergeSettings(partial?: Partial<MatchSettings>): MatchSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}
