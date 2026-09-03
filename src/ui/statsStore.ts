export type Achievements = {
  firstBlood: boolean;
  tenKos: boolean;
  firstWin: boolean;
};

export type LocalStats = {
  matches: number;
  wins: number;
  kos: number;
  achievements: Achievements;
};

export const EMPTY_ACHIEVEMENTS: Achievements = { firstBlood: false, tenKos: false, firstWin: false };

const KEY = 'floppy-clash.stats';

export const EMPTY_STATS: LocalStats = { matches: 0, wins: 0, kos: 0, achievements: { ...EMPTY_ACHIEVEMENTS } };

export function unlockAchievements(s: LocalStats): LocalStats {
  if (s.kos >= 1) s.achievements.firstBlood = true;
  if (s.kos >= 10) s.achievements.tenKos = true;
  if (s.wins >= 1) s.achievements.firstWin = true;
  return s;
}

export function loadStats(): LocalStats {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LocalStats>;
    return unlockAchievements({
      ...EMPTY_STATS,
      ...raw,
      achievements: { ...EMPTY_ACHIEVEMENTS, ...raw.achievements },
    });
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
  unlockAchievements(s);
  saveStats(s);
  return s;
}

export function recordMatch(won: boolean): LocalStats {
  const s = loadStats();
  s.matches += 1;
  if (won) s.wins += 1;
  unlockAchievements(s);
  saveStats(s);
  return s;
}
