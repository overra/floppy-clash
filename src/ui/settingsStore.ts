import type { ItemRate, MatchMode } from '../sim/rules/settings';

export type UserSettings = {
  mode: MatchMode;
  maxHp: number;
  stocks: number;
  firstTo: number;
  showWins: boolean;
  rotation: 'random' | 'ordered';
  items: ItemRate;
  hazards: boolean;
  fixedSpawns: boolean;
  enabledWeapons: string[] | 'all';
  enabledLevels: string[] | 'all';
  haptics: boolean;
  colorblind: boolean;
  reduceShake: boolean;
  reduceBlood: boolean;
  renderer: 'auto' | 'gpu' | 'canvas';
  sfx: number;
  music: number;
  lighting: boolean;
  includeUserLevels: boolean;
  /** Send anonymous usage and frame-pacing statistics (src/telemetry). */
  telemetry: boolean;
};

const KEY = 'floppy-clash.settings';

export const DEFAULT_USER_SETTINGS: UserSettings = {
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
  haptics: true,
  colorblind: false,
  reduceShake: false,
  reduceBlood: false,
  renderer: 'auto',
  sfx: 0.8,
  music: 0.25,
  lighting: false,
  includeUserLevels: true,
  telemetry: true,
};

export function loadSettings(): UserSettings {
  try {
    return { ...DEFAULT_USER_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as UserSettings) };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveSettings(s: UserSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
