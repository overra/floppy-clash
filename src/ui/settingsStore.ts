export type UserSettings = {
  maxHp: number;
  firstTo: number;
  showWins: boolean;
  rotation: 'random' | 'ordered';
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
  /** PLAN 4.6 opt-in motor arms on living players. */
  physicsArms: boolean;
  includeUserLevels: boolean;
};

const KEY = 'floppy-clash.settings';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  maxHp: 100,
  firstTo: 0,
  showWins: true,
  rotation: 'random',
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
  physicsArms: false,
  includeUserLevels: true,
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
