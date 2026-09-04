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
  /** Palette index per slot (humans pick theirs on the join screen); slots past the end use their index. */
  colors?: number[];
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
