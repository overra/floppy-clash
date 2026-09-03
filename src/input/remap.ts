export type PadMap = {
  jump: number;
  attack: number;
  block: number;
  throw: number;
  pause: number;
};

export const DEFAULT_MAP: PadMap = { jump: 0, attack: 7, block: 6, throw: 3, pause: 9 };

export function loadMaps(): Record<string, PadMap> {
  try {
    return JSON.parse(localStorage.getItem('floppy-clash.padmaps') ?? '{}') as Record<string, PadMap>;
  } catch {
    return {};
  }
}

/** PLAN 4.12: unknown / non-`standard` mappings (including Firefox `''`) open remap. */
export function shouldOfferRemap(
  mapping: string,
  padId: string,
  maps: Record<string, PadMap>,
): boolean {
  return mapping !== 'standard' && !maps[padId];
}

export function saveMap(padId: string, map: PadMap): void {
  const all = loadMaps();
  all[padId] = map;
  localStorage.setItem('floppy-clash.padmaps', JSON.stringify(all));
}

/** PLAN 4.12: Start on join uses the remapped pause / Options button. */
export function joinStartIndex(map?: PadMap): number {
  return map?.pause ?? DEFAULT_MAP.pause;
}
