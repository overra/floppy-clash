export type ThemeId =
  | 'woods'
  | 'desert'
  | 'factory'
  | 'castle'
  | 'winter'
  | 'lava'
  | 'laser'
  | 'western'
  | 'halloween'
  | 'arena';

export type ThemePalette = {
  id: ThemeId;
  backgroundTop: string;
  backgroundBottom: string;
  solid: string;
  accent: string;
  blood: string;
  hazard: string;
};

export const THEMES: Record<ThemeId, ThemePalette> = {
  woods: {
    id: 'woods',
    backgroundTop: '#87b67a',
    backgroundBottom: '#3d5a3a',
    solid: '#5b3a29',
    accent: '#7d9a4a',
    blood: '#8b1e1e',
    hazard: '#2b2b2b',
  },
  desert: {
    id: 'desert',
    backgroundTop: '#f2d08b',
    backgroundBottom: '#c48a3a',
    solid: '#d4a15a',
    accent: '#a86b2d',
    blood: '#8b1e1e',
    hazard: '#6b3a12',
  },
  factory: {
    id: 'factory',
    backgroundTop: '#6d7380',
    backgroundBottom: '#2d3138',
    solid: '#8a909a',
    accent: '#f2c14e',
    blood: '#8b1e1e',
    hazard: '#d4552b',
  },
  castle: {
    id: 'castle',
    backgroundTop: '#6b7084',
    backgroundBottom: '#2c2f3a',
    solid: '#4a4e5c',
    accent: '#c9b37a',
    blood: '#8b1e1e',
    hazard: '#9a9a9a',
  },
  winter: {
    id: 'winter',
    backgroundTop: '#d7e7f2',
    backgroundBottom: '#7fa3c2',
    solid: '#e8f1f8',
    accent: '#9ec4e0',
    blood: '#8b1e1e',
    hazard: '#6aa0c8',
  },
  lava: {
    id: 'lava',
    backgroundTop: '#3a1f1a',
    backgroundBottom: '#1a0b08',
    solid: '#4a2a22',
    accent: '#ff6a1a',
    blood: '#8b1e1e',
    hazard: '#ff3b00',
  },
  laser: {
    id: 'laser',
    backgroundTop: '#1b2030',
    backgroundBottom: '#0b0d14',
    solid: '#2a3148',
    accent: '#ff3d6e',
    blood: '#8b1e1e',
    hazard: '#39f2ff',
  },
  western: {
    id: 'western',
    backgroundTop: '#e0c48a',
    backgroundBottom: '#8a6232',
    solid: '#6b4226',
    accent: '#c9a227',
    blood: '#8b1e1e',
    hazard: '#3d2a14',
  },
  halloween: {
    id: 'halloween',
    backgroundTop: '#2b1a3a',
    backgroundBottom: '#120814',
    solid: '#3a2450',
    accent: '#ff7a18',
    blood: '#8b1e1e',
    hazard: '#7cff4a',
  },
  arena: {
    id: 'arena',
    backgroundTop: '#4a5560',
    backgroundBottom: '#1d2228',
    solid: '#6b7280',
    accent: '#f2c14e',
    blood: '#8b1e1e',
    hazard: '#e85d4c',
  },
};

export function themeOf(id: string): ThemePalette {
  return THEMES[id as ThemeId] ?? THEMES.arena;
}
