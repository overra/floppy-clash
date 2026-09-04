export type PadMap = {
  jump: number;
  attack: number;
  kick: number;
  block: number;
  throw: number;
  pause: number;
};

export const DEFAULT_MAP: PadMap = { jump: 0, attack: 7, kick: 5, block: 6, throw: 3, pause: 9 };

export function loadMaps(): Record<string, PadMap> {
  try {
    const maps = JSON.parse(localStorage.getItem('floppy-clash.padmaps') ?? '{}') as Record<string, Partial<PadMap>>;
    // Maps saved before a button existed fall back to its default for that one binding.
    return Object.fromEntries(Object.entries(maps).map(([id, m]) => [id, { ...DEFAULT_MAP, ...m }]));
  } catch {
    return {};
  }
}

export function saveMap(padId: string, map: PadMap): void {
  const all = loadMaps();
  all[padId] = map;
  localStorage.setItem('floppy-clash.padmaps', JSON.stringify(all));
}
