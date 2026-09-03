import { describe, expect, it } from 'vitest';
import { applyFistDrive } from '../src/sim/ai/fistDrive';
import { Bot, Health, MatchState, RoundPhase, RoundState, Transform } from '../src/sim/traits';
import { blankInputs } from '../src/sim/input';
import { fistArena, makeSim, pin, playerOf, speedRounds } from './helpers';

describe('fists-only match', () => {
  it('fistDrive walks toward a living foe and punches in range', () => {
    const sim = makeSim({
      level: fistArena,
      seed: 3,
      settings: { playerCount: 2, maxHp: 1, enabledWeapons: [] },
    });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    pin(sim, a, 8, 4);
    pin(sim, b, 14, 4);
    const far = applyFistDrive(blankInputs(4), sim.ecs, 0, 1);
    expect(far[0]?.moveX).toBeGreaterThan(0);
    expect(far[0]?.attack).toBe(false);
    pin(sim, a, 10, 4);
    pin(sim, b, 10.7, 4);
    const near = applyFistDrive(blankInputs(4), sim.ecs, 0, 18);
    expect(near[0]?.attack).toBe(true);
    expect(a.get(Transform)?.x).toBeCloseTo(10, 1);
  });

  it('finishes 10 rounds via live bot punches and a mid-round input mute', () => {
    const host = makeSim({
      level: fistArena,
      seed: 11,
      settings: {
        playerCount: 0,
        bots: 4,
        firstTo: 0,
        enabledWeapons: [],
        maxHp: 1,
        enabledLevels: ['fist-pit'],
        rotation: 'ordered',
      },
    });
    speedRounds(host);
    expect(host.ctx.tuning.scoreboardTicks).toBe(90);
    let disconnected = false;
    let reconnected = false;
    let kills = 0;
    for (let i = 0; i < 36_000; i++) {
      const fighting = host.ecs.get(RoundState)?.phase === RoundPhase.Fighting;
      if (fighting && !disconnected && i > 80) {
        const p0 = playerOf(host, 0);
        if (p0.has(Bot)) p0.remove(Bot);
        disconnected = true;
      }
      if (disconnected && i > 200) {
        const p0 = playerOf(host, 0);
        if (!p0.has(Bot)) p0.add(Bot({ slot: 0, think: 0 }));
        reconnected = true;
      }
      const ev = host.step();
      const fists = ev.some((e) => e.type === 'shot' && e.weaponId === 'fists');
      const tickKills = ev.filter((e) => e.type === 'kill').length;
      if (tickKills > 0) expect(fists).toBe(true);
      kills += tickKills;
      if ((host.ecs.get(MatchState)?.round ?? 0) >= 10) break;
    }
    expect(disconnected).toBe(true);
    expect(reconnected).toBe(true);
    expect(kills).toBeGreaterThanOrEqual(10);
    expect(host.ecs.get(MatchState)?.round ?? 0).toBeGreaterThanOrEqual(10);
    expect(host.hash()).toMatch(/^[0-9a-f]{8}$/);
    expect(playerOf(host, 0).get(Health)?.maxHp).toBe(1);
  }, 60_000);
});
