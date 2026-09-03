import { RoundPhase } from '../sim/traits';

export type ScoreboardTickCursor = { tick: number; phase: number };

/**
 * Count host sim ticks spent in Scoreboard that a client actually applied.
 * Same snap re-applied (render-rate apply) must not inflate the count.
 * A single end-of-window snap must not stand in for the 90-tick Appendix A window.
 */
export function accumulateScoreboardTicks(
  seen: number,
  cursor: ScoreboardTickCursor | null,
  next: ScoreboardTickCursor,
): { seen: number; cursor: ScoreboardTickCursor } {
  let out = seen;
  if (next.phase === RoundPhase.Scoreboard) {
    if (cursor?.phase === RoundPhase.Scoreboard) {
      if (next.tick > cursor.tick) out += next.tick - cursor.tick;
    } else {
      out += 1;
    }
  }
  return { seen: out, cursor: { tick: next.tick, phase: next.phase } };
}
