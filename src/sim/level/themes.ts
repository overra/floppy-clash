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

/**
 * Art direction per theme: bright, saturated sky gradient; near-black silhouette solids with a
 * themed trim on their top edge; two layers of backdrop decor tones (far is closer to the sky).
 */
export type ThemePalette = {
  id: ThemeId;
  backgroundTop: string;
  backgroundBottom: string;
  /** Silhouette color for level solids. */
  solid: string;
  /** Top-edge cap on solids (grass, snow, sand, metal). */
  trim: string;
  /** Generic accent (crown, sparks, highlights). */
  accent: string;
  blood: string;
  /** Dangerous things (spikes, saw teeth, laser). */
  hazard: string;
  /** Backdrop silhouettes (near) and far haze. */
  decor: string;
  decorFar: string;
  /** Vignette strength 0–1. */
  vignette: number;
  /** Default decor kinds for procedural backdrops. */
  decorKinds: string[];
};

export const THEMES: Record<ThemeId, ThemePalette> = {
  woods: {
    id: 'woods',
    backgroundTop: '#9fd6b4',
    backgroundBottom: '#3f7f66',
    solid: '#2a2830',
    trim: '#6fc35b',
    accent: '#f2c14e',
    blood: '#b3161c',
    hazard: '#d7dbe2',
    decor: '#356b5a',
    decorFar: '#5f9e88',
    vignette: 0.32,
    decorKinds: ['pine', 'tree', 'bush', 'hill'],
  },
  desert: {
    id: 'desert',
    backgroundTop: '#fbe0a6',
    backgroundBottom: '#d7975a',
    solid: '#3a2d28',
    trim: '#ecc27f',
    accent: '#f2c14e',
    blood: '#b3161c',
    hazard: '#d7dbe2',
    decor: '#c4823f',
    decorFar: '#e2ab6c',
    vignette: 0.28,
    decorKinds: ['dune', 'cactus', 'sun'],
  },
  factory: {
    id: 'factory',
    backgroundTop: '#8b93a3',
    backgroundBottom: '#2f343c',
    solid: '#1f2227',
    trim: '#8f979f',
    accent: '#ff8a3d',
    blood: '#b3161c',
    hazard: '#f2c14e',
    decor: '#454b55',
    decorFar: '#5f6773',
    vignette: 0.4,
    decorKinds: ['gear', 'stack', 'pipe'],
  },
  castle: {
    id: 'castle',
    backgroundTop: '#9aa0b8',
    backgroundBottom: '#383c50',
    solid: '#262833',
    trim: '#7f8497',
    accent: '#e2c46a',
    blood: '#b3161c',
    hazard: '#c8ccd4',
    decor: '#474b62',
    decorFar: '#6a6f88',
    vignette: 0.42,
    decorKinds: ['tower', 'moon', 'hill'],
  },
  winter: {
    id: 'winter',
    backgroundTop: '#eaf4fc',
    backgroundBottom: '#96bcdc',
    solid: '#2f3b48',
    trim: '#ffffff',
    accent: '#7ec8ff',
    blood: '#b3161c',
    hazard: '#c8ccd4',
    decor: '#a9c9e3',
    decorFar: '#c9deef',
    vignette: 0.22,
    decorKinds: ['hill', 'pine', 'snow'],
  },
  lava: {
    id: 'lava',
    backgroundTop: '#5a271b',
    backgroundBottom: '#150806',
    solid: '#241a19',
    trim: '#5b3d36',
    accent: '#ff8c1a',
    blood: '#b3161c',
    hazard: '#ff5a00',
    decor: '#3a1f1a',
    decorFar: '#4d2a21',
    vignette: 0.5,
    decorKinds: ['ember', 'stalagmite'],
  },
  laser: {
    id: 'laser',
    backgroundTop: '#222a45',
    backgroundBottom: '#0a0c16',
    solid: '#232a45',
    trim: '#4f62a8',
    accent: '#ff3d6e',
    blood: '#b3161c',
    hazard: '#39f2ff',
    decor: '#161b2e',
    decorFar: '#1e2540',
    vignette: 0.45,
    decorKinds: ['grid', 'star'],
  },
  western: {
    id: 'western',
    backgroundTop: '#f4d494',
    backgroundBottom: '#aa7440',
    solid: '#3c2a1e',
    trim: '#dba969',
    accent: '#c9a227',
    blood: '#b3161c',
    hazard: '#d7dbe2',
    decor: '#8f5b30',
    decorFar: '#c08a4f',
    vignette: 0.3,
    decorKinds: ['mesa', 'cactus', 'sun'],
  },
  halloween: {
    id: 'halloween',
    backgroundTop: '#3f2158',
    backgroundBottom: '#120814',
    solid: '#1f1330',
    trim: '#4a3070',
    accent: '#ff7a18',
    blood: '#b3161c',
    hazard: '#7cff4a',
    decor: '#2a1a40',
    decorFar: '#3a2655',
    vignette: 0.5,
    decorKinds: ['moon', 'grave', 'bat', 'hill'],
  },
  arena: {
    id: 'arena',
    backgroundTop: '#6b7785',
    backgroundBottom: '#252a31',
    solid: '#22262c',
    trim: '#8b96a2',
    accent: '#f2c14e',
    blood: '#b3161c',
    hazard: '#e85d4c',
    decor: '#3b444e',
    decorFar: '#525c68',
    vignette: 0.38,
    decorKinds: ['hill', 'cloud'],
  },
};

export function themeOf(id: string): ThemePalette {
  return THEMES[id as ThemeId] ?? THEMES.arena;
}
