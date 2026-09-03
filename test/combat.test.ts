import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import {
  Crown,
  Dead,
  Health,
  MatchState,
  Player,
  RagdollPart,
  RoundPhase,
  RoundState,
  Transform,
} from '../src/sim/traits';
import { nextMatchLevel } from '../src/sim/systems/reset';
import { hold, hp, makeSim, playerOf } from './helpers';

describe('M2 combat and rounds', () => {
  it('punch deals about 22 damage', () => {
    const sim = makeSim({ level: woodsClearing, seed: 5, settings: { playerCount: 2, bots: 0 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 10.8, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 10.8, y: 4, angle: 0 });
    const before = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 8; i++) {
      sim.step([hold({ attack: i === 2, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    const after = b.get(Health)?.hp ?? 100;
    expect(before - after).toBeGreaterThanOrEqual(20);
  });

  it('airborne punch (dropkick) knocks harder than a grounded punch', () => {
    const groundedKb = punchKnock(false);
    const airKb = punchKnock(true);
    expect(airKb).toBeGreaterThan(groundedKb * 1.1);
  });

  it('out of bounds kills', () => {
    const sim = makeSim({ seed: 6, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: -40, y: -40 });
    p.set(Transform, { x: -40, y: -40, angle: 0 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('round leaves countdown into fighting', () => {
    const sim = makeSim({ seed: 8, settings: { playerCount: 2 } });
    for (let i = 0; i < 200; i++) sim.step();
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);
  });

  it('last standing awards a win', () => {
    const sim = makeSim({ level: woodsClearing, seed: 9, settings: { playerCount: 2 } });
    for (let i = 0; i < 200; i++) sim.step();
    const b = playerOf(sim, 1);
    b.set(Health, { hp: 0, maxHp: 100 });
    for (let i = 0; i < 10; i++) sim.step();
    const match = sim.ecs.get(MatchState);
    expect((match?.wins0 ?? 0) + (match?.wins1 ?? 0)).toBeGreaterThanOrEqual(1);
    void Player;
    void hp;
  });

  it('first-to-1 reaches MatchOver', () => {
    const sim = makeSim({
      level: woodsClearing,
      seed: 10,
      settings: { playerCount: 2, firstTo: 1 },
    });
    sim.ctx.tuning.countdownTicks = 2;
    sim.ctx.tuning.slowmoTicks = 2;
    for (let i = 0; i < 10; i++) sim.step();
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);
    playerOf(sim, 1).set(Health, { hp: 0, maxHp: 100 });
    for (let i = 0; i < 8; i++) sim.step();
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.MatchOver);
    expect(sim.ecs.get(MatchState)?.wins0).toBeGreaterThanOrEqual(1);
  });

  it('same-tick double kill is a draw and awards no win', () => {
    const sim = makeSim({
      level: woodsClearing,
      seed: 11,
      settings: { playerCount: 2, firstTo: 0 },
    });
    sim.ctx.tuning.countdownTicks = 2;
    for (let i = 0; i < 10; i++) sim.step();
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);
    playerOf(sim, 0).set(Health, { hp: 0, maxHp: 100 });
    playerOf(sim, 1).set(Health, { hp: 0, maxHp: 100 });
    const ev = sim.step();
    const match = sim.ecs.get(MatchState);
    expect((match?.wins0 ?? 0) + (match?.wins1 ?? 0)).toBe(0);
    expect(ev.some((e) => e.type === 'round-phase' && e.phase === 'draw')).toBe(true);
  });

  it('crown sits on the match wins leader, not only the last kill', () => {
    const sim = makeSim({
      level: woodsClearing,
      seed: 12,
      settings: { playerCount: 2, firstTo: 0 },
    });
    sim.ctx.tuning.countdownTicks = 2;
    sim.ctx.tuning.slowmoTicks = 2;
    sim.ctx.tuning.scoreboardTicks = 2;
    for (let i = 0; i < 10; i++) sim.step();
    const match = sim.ecs.get(MatchState)!;
    sim.ecs.set(MatchState, { ...match, wins0: 3, wins1: 1 });
    playerOf(sim, 0).set(Health, { hp: 0, maxHp: 100 });
    for (let i = 0; i < 6; i++) sim.step();
    expect(playerOf(sim, 0).has(Crown)).toBe(true);
    expect(playerOf(sim, 1).has(Crown)).toBe(false);
  });

  it('death swaps the capsule for a 10-part ragdoll', () => {
    const sim = makeSim({ level: woodsClearing, seed: 13, settings: { playerCount: 1 } });
    playerOf(sim, 0).set(Health, { hp: 0, maxHp: 100 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    let parts = 0;
    sim.ecs.query(RagdollPart).updateEach(() => {
      parts += 1;
    });
    expect(parts).toBe(10);
  });

  it('random rotation never repeats the same level immediately', () => {
    const sim = makeSim({ settings: { playerCount: 2, rotation: 'random' } });
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      nextMatchLevel(sim.ecs);
      seen.push(sim.ctx.level.id);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).not.toBe(seen[i - 1]);
    }
  });
});

function punchKnock(airborne: boolean): number {
  const sim = makeSim({ level: woodsClearing, seed: airborne ? 21 : 20, settings: { playerCount: 2 } });
  const a = playerOf(sim, 0);
  const b = playerOf(sim, 1);
  const y = airborne ? 8 : 4;
  sim.ctx.bodies.get(a)?.setPosition({ x: 10, y });
  sim.ctx.bodies.get(b)?.setPosition({ x: 10.75, y });
  a.set(Transform, { x: 10, y, angle: 0 });
  b.set(Transform, { x: 10.75, y, angle: 0 });
  for (let i = 0; i < 6; i++) {
    sim.step([hold({ attack: i === 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
  }
  return Math.abs(sim.ctx.bodies.get(b)?.getLinearVelocity().x ?? 0);
}
