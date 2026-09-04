export type LevelRotation = 'random' | 'ordered';

/**
 * `standing`: Stick Fight rules — HP drains, last one standing takes the round.
 * `launch`: platform-fighter rules — damage builds a percentage that scales knockback, the only
 * way out is past the blast zone, and every fighter has a stock of lives per round.
 */
export type MatchMode = 'standing' | 'launch';

/** How much rains from the sky: `low` skips the opening volley and drops at a third of the cadence. */
export type ItemRate = 'off' | 'low' | 'normal';

export interface MatchSettings {
  mode: MatchMode;
  maxHp: number;
  /** Launch mode: lives per fighter per round. */
  stocks: number;
  firstTo: number;
  showWins: boolean;
  rotation: LevelRotation;
  items: ItemRate;
  /** false strips arenas down to their solids and platforms (a neutral stage). */
  hazards: boolean;
  /** Spawn by slot order instead of shuffling the spawn points every round. */
  fixedSpawns: boolean;
  enabledWeapons: string[] | 'all';
  enabledLevels: string[] | 'all';
  playerCount: number;
  bots: number;
  /** Palette index per slot (humans pick theirs on the join screen); slots past the end use their index. */
  colors?: number[];
}

export const DEFAULT_SETTINGS: MatchSettings = {
  mode: 'standing',
  maxHp: 100,
  stocks: 3,
  firstTo: 0,
  showWins: true,
  rotation: 'random',
  items: 'normal',
  hazards: true,
  fixedSpawns: false,
  enabledWeapons: 'all',
  enabledLevels: 'all',
  playerCount: 2,
  bots: 0,
};

export function mergeSettings(partial?: Partial<MatchSettings>): MatchSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}
