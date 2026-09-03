import { describe, expect, it } from 'vitest';
import { Health, MatchState, RoundPhase, RoundState } from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';

describe('fists-only match', () => {
  it('finishes 10 rounds and survives a mid-round zero-input disconnect', () => {
    const host = makeSim({ settings: { playerCount: 4, firstTo: 0, enabledWeapons: [] } });
    host.ctx.tuning.countdownTicks = 3;
    host.ctx.tuning.slowmoTicks = 2;
    host.ctx.tuning.scoreboardTicks = 2;
    let disconnected = false;
    for (let i = 0; i < 8000; i++) {
      const phase = host.ecs.get(RoundState)?.phase;
      const live = [0, 1, 2, 3].map((s) => playerOf(host, s));
      if (phase === RoundPhase.Fighting) {
        if (!disconnected && i > 80) {
          disconnected = true;
        }
        for (let s = 1; s < 4; s++) {
          const p = live[s]!;
          if ((p.get(Health)?.hp ?? 0) > 0) p.set(Health, { hp: 0, maxHp: 100 });
        }
      }
      const inputs = disconnected && i < 200
        ? [hold({}), hold({}), hold({}), hold({})]
        : [hold({ moveX: 0.2, attack: i % 20 === 0 }), hold({}), hold({}), hold({})];
      host.step(inputs);
      if ((host.ecs.get(MatchState)?.round ?? 0) >= 10) break;
    }
    expect(disconnected).toBe(true);
    expect(host.ecs.get(MatchState)?.round ?? 0).toBeGreaterThanOrEqual(10);
    expect(host.hash()).toMatch(/^[0-9a-f]{8}$/);
  }, 60_000);
});
