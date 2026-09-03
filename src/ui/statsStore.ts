export type LocalStats = {
  matches: number;
  wins: number;
  kos: number;
};

const KEY = 'floppy-clash.stats';

export const EMPTY_STATS: LocalStats = { matches: 0, wins: 0, kos: 0 };

export function loadStats(): LocalStats {
  try {
    return { ...EMPTY_STATS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as LocalStats) };
  } catch {
    return { ...EMPTY_STATS };
  }
}

export function saveStats(s: LocalStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

export function recordKos(n = 1): LocalStats {
  const s = loadStats();
  s.kos += n;
  saveStats(s);
  return s;
}

export function recordMatch(won: boolean): LocalStats {
  const s = loadStats();
  s.matches += 1;
  if (won) s.wins += 1;
  saveStats(s);
  return s;
}
