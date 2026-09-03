import { describe, expect, it } from 'vitest';
import { Dead, Health, MatchState, RoundPhase, RoundState } from '../src/sim/traits';
import { hold, makeSim, pin, playerOf, woodsClearing } from './helpers';

describe('fists-only match', () => {
  it('finishes 10 rounds via live punches and survives a mid-round zero-input disconnect', () => {
    const host = makeSim({
      level: woodsClearing,
      seed: 11,
      settings: {
        playerCount: 4,
        firstTo: 0,
        enabledWeapons: [],
        maxHp: 1,
        enabledLevels: ['woods-01'],
        rotation: 'ordered',
      },
    });
    host.ctx.tuning.countdownTicks = 3;
    host.ctx.tuning.slowmoTicks = 2;
    host.ctx.tuning.scoreboardTicks = 2;
    let disconnected = false;
    let kills = 0;
    for (let i = 0; i < 8000; i++) {
      const phase = host.ecs.get(RoundState)?.phase;
      const fighting = phase === RoundPhase.Fighting;
      if (fighting) {
        if (!disconnected && i > 80) disconnected = true;
        const a = playerOf(host, 0);
        pin(host, a, 10, 4);
        for (let s = 1; s < 4; s++) {
          const p = playerOf(host, s);
          if (p.has(Dead) || (p.get(Health)?.hp ?? 0) <= 0) continue;
          pin(host, p, 10.55, 4);
        }
      }
      const inputs =
        disconnected && i < 200
          ? [hold({}), hold({}), hold({}), hold({})]
          : [
              hold({ moveX: 0.2, attack: fighting && i % 8 === 0, aimX: 1, aimY: 0 }),
              hold({}),
              hold({}),
              hold({}),
            ];
      const ev = host.step(inputs);
      const fists = ev.some((e) => e.type === 'shot' && e.weaponId === 'fists');
      const tickKills = ev.filter((e) => e.type === 'kill').length;
      if (tickKills > 0) expect(fists).toBe(true);
      kills += tickKills;
      if ((host.ecs.get(MatchState)?.round ?? 0) >= 10) break;
    }
    expect(disconnected).toBe(true);
    expect(kills).toBeGreaterThanOrEqual(10);
    expect(host.ecs.get(MatchState)?.round ?? 0).toBeGreaterThanOrEqual(10);
    expect(host.hash()).toMatch(/^[0-9a-f]{8}$/);
  }, 60_000);
});
