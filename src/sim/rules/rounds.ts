import { createQuery, type World } from 'koota';
import { emit, getContext } from '../context';
import { Crown, Dead, MatchState, Player, RoundPhase, RoundState, Stocks } from '../traits';
import { nextMatchLevel, respawnOne, respawnPlayers } from '../systems/reset';
import { isLaunch } from './mode';
import { openDrops } from './spawner';

const playersQ = createQuery(Player);

export function rules(world: World): void {
  const ctx = getContext(world);
  const round = world.get(RoundState);
  const match = world.get(MatchState);
  if (!round || !match) return;
  const launch = isLaunch(world);

  // Who is still in the round: on their feet, or (launch mode) down but with a stock to come back on.
  const living: number[] = [];
  world.query(playersQ).updateEach(([p], e) => {
    if (!ctx.players.includes(e)) return;
    const alive = !e.has(Dead);
    if (alive || (launch && (e.get(Stocks)?.left ?? 0) > 0)) living.push(p.slot);
  });
  round.aliveMask = living.reduce((m, s) => m | (1 << s), 0);
  round.ticks += 1;

  if (launch && round.phase !== RoundPhase.Loading) tickRespawns(world);

  if (round.phase === RoundPhase.Loading) {
    if (round.ticks <= 1 && match.round > 0) {
      nextMatchLevel(world);
      respawnPlayers(world);
      // Pick up the level index the rotation just stored; the copy above predates it.
      const fresh = world.get(MatchState);
      if (fresh) match.levelIndex = fresh.levelIndex;
    }
    round.phase = RoundPhase.Countdown;
    round.ticks = 0;
    round.winner = -1;
    emit(world, { type: 'round-phase', phase: 'countdown' });
  } else if (round.phase === RoundPhase.Countdown) {
    if (round.ticks >= ctx.tuning.countdownTicks) {
      round.phase = RoundPhase.Fighting;
      round.ticks = 0;
      openDrops(world);
      emit(world, { type: 'round-phase', phase: 'fighting' });
    }
  } else if (round.phase === RoundPhase.Fighting) {
    if (living.length <= 1 && ctx.players.length > 1) {
      round.phase = RoundPhase.LastKill;
      round.ticks = 0;
      if (living.length === 1) {
        const slot = living[0]!;
        round.winner = slot;
        const key = `wins${slot}` as 'wins0' | 'wins1' | 'wins2' | 'wins3';
        match[key] += 1;
        emit(world, { type: 'score', slot, wins: match[key] });
        world.query(Player).updateEach(([p], e) => {
          if (p.slot === slot) e.add(Crown());
          else if (e.has(Crown)) e.remove(Crown);
        });
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

  world.set(RoundState, round);
  world.set(MatchState, match);
}

/** Fallen fighters with a stock left count down and drop back in (the level is still up until Loading). */
function tickRespawns(world: World): void {
  for (const player of getContext(world).players) {
    const stocks = player.get(Stocks);
    if (!stocks || stocks.respawnIn <= 0 || !player.has(Dead)) continue;
    if (stocks.respawnIn > 1) {
      player.set(Stocks, { ...stocks, respawnIn: stocks.respawnIn - 1 });
    } else {
      respawnOne(world, player);
    }
  }
}

/** Players may move during the countdown but nobody can hurt anybody until "FIGHT". */
export function combatAllowed(world: World): boolean {
  const phase = world.get(RoundState)?.phase ?? RoundPhase.Fighting;
  return phase !== RoundPhase.Loading && phase !== RoundPhase.Countdown;
}

export function stepScaleForPhase(world: World): number {
  const round = world.get(RoundState);
  if (round?.phase === RoundPhase.LastKill) return getContext(world).tuning.lastKillSlowmo;
  return 1;
}
