import { createQuery, type World } from 'koota';
import { emit, getContext } from '../context';
import { Crown, Dead, MatchState, Player, RoundPhase, RoundState } from '../traits';
import { nextMatchLevel, respawnPlayers } from '../systems/reset';

const playersQ = createQuery(Player);

export function rules(world: World): void {
  const ctx = getContext(world);
  const round = world.get(RoundState);
  const match = world.get(MatchState);
  if (!round || !match) return;

  const living: number[] = [];
  world.query(playersQ).updateEach(([p], e) => {
    if (!e.has(Dead) && ctx.players.includes(e)) living.push(p.slot);
  });
  round.aliveMask = living.reduce((m, s) => m | (1 << s), 0);
  round.ticks += 1;

  if (round.phase === RoundPhase.Loading) {
    if (round.ticks <= 1 && match.round > 0) {
      nextMatchLevel(world);
      respawnPlayers(world);
    }
    round.phase = RoundPhase.Countdown;
    round.ticks = 0;
    emit(world, { type: 'round-phase', phase: 'countdown' });
  } else if (round.phase === RoundPhase.Countdown) {
    if (round.ticks >= ctx.tuning.countdownTicks) {
      round.phase = RoundPhase.Fighting;
      round.ticks = 0;
      emit(world, { type: 'round-phase', phase: 'fighting' });
    }
  } else if (round.phase === RoundPhase.Fighting) {
    if (living.length <= 1 && ctx.players.length > 1) {
      round.phase = RoundPhase.LastKill;
      round.ticks = 0;
      if (living.length === 1) {
        const slot = living[0]!;
        const key = `wins${slot}` as 'wins0' | 'wins1' | 'wins2' | 'wins3';
        match[key] += 1;
        emit(world, { type: 'score', slot, wins: match[key] });
        if (match.firstTo > 0 && match[key] >= match.firstTo) {
          round.phase = RoundPhase.MatchOver;
          emit(world, { type: 'round-phase', phase: 'match-over' });
        }
      } else {
        emit(world, { type: 'round-phase', phase: 'draw' });
      }
      if (round.phase === RoundPhase.LastKill) emit(world, { type: 'round-phase', phase: 'last-kill' });
    }
  } else if (round.phase === RoundPhase.LastKill) {
    if (round.ticks >= ctx.tuning.slowmoTicks) {
      round.phase = RoundPhase.Scoreboard;
      round.ticks = 0;
      emit(world, { type: 'round-phase', phase: 'scoreboard' });
    }
  } else if (round.phase === RoundPhase.Scoreboard) {
    if (round.ticks >= ctx.tuning.scoreboardTicks) {
      round.phase = RoundPhase.Loading;
      round.ticks = 0;
      match.round += 1;
      emit(world, { type: 'round-phase', phase: 'loading' });
    }
  }

  assignCrownToLeader(world, match);
  world.set(RoundState, round);
  world.set(MatchState, match);
}

/** PLAN 4.8: the wins leader wears the crown (ties wear none). */
export function assignCrownToLeader(world: World, match: { wins0: number; wins1: number; wins2: number; wins3: number }): void {
  const wins = [match.wins0, match.wins1, match.wins2, match.wins3];
  const best = Math.max(...wins);
  const leaders = wins.map((w, i) => (w === best && best > 0 ? i : -1)).filter((i) => i >= 0);
  world.query(Player).updateEach(([p], e) => {
    const should = leaders.length === 1 && leaders[0] === p.slot;
    if (should && !e.has(Crown)) e.add(Crown());
    if (!should && e.has(Crown)) e.remove(Crown);
  });
}

export function stepScaleForPhase(world: World): number {
  const round = world.get(RoundState);
  if (round?.phase === RoundPhase.LastKill) return getContext(world).tuning.lastKillSlowmo;
  return 1;
}
