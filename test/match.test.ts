import { universe } from 'koota';
import { describe, expect, it } from 'vitest';
import { Health, MatchState, RoundPhase, RoundState } from '../src/sim/traits';
import { createSimWorld, type SimHandle } from '../src/sim/world';
import { gymLevel, hold, makeSim, playerOf } from './helpers';

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

  it('can start and tear down far more matches than the ECS world cap in one session', () => {
    // Koota caps live worlds at 16; a long couch session starts a new sim per match, so every
    // old one must be released or the game dies on the seventeenth "Start".
    universe.reset();
    let sim: SimHandle | null = null;
    for (let i = 0; i < 40; i++) {
      sim?.destroy();
      sim = createSimWorld({ level: gymLevel, seed: i, settings: { playerCount: 1, bots: 1 } });
      sim.step();
    }
    expect(sim!.getTick()).toBe(1);
    sim!.destroy();
  });
});
