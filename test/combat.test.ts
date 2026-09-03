import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { Combat, Dead, Health, MatchState, Player, RoundPhase, RoundState, Transform } from '../src/sim/traits';
import { hold, hp, makeSim, playerOf, runTrack } from './helpers';

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

  /** Two fighters toe to toe on the run track floor, facing each other. */
  function faceOff() {
    const sim = makeSim({ level: runTrack, seed: 5, settings: { playerCount: 2, bots: 0 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 20.8, y: 2.81 });
    for (let i = 0; i < 6; i++) sim.step([hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
    return { sim, a, b };
  }

  it('two punches thrown at once clash: no damage, both fighters stagger apart', () => {
    const { sim, a, b } = faceOff();
    let clashes = 0;
    for (let i = 0; i < 8; i++) {
      const ev = sim.step([hold({ attack: i === 0, aimX: 1, aimY: 0 }), hold({ attack: i === 1, aimX: -1, aimY: 0 }), hold({}), hold({})]);
      clashes += ev.filter((e) => e.type === 'clash').length;
    }
    expect(clashes).toBe(1);
    expect(a.get(Health)?.hp).toBe(100);
    expect(b.get(Health)?.hp).toBe(100);
    expect((a.get(Combat)?.stun ?? 0) + (b.get(Combat)?.stun ?? 0)).toBeGreaterThan(0);
    // knocked away from each other
    expect((a.get(Transform)?.x ?? 0) < 20).toBe(true);
    expect((b.get(Transform)?.x ?? 0) > 20.8).toBe(true);
  });

  it('a punch into a raised guard is blocked and staggers the attacker', () => {
    const { sim, a, b } = faceOff();
    // B raises the guard well ahead of time so this is an ordinary (non-perfect) block.
    for (let i = 0; i < 15; i++) sim.step([hold({ aimX: 1, aimY: 0 }), hold({ block: true, aimX: -1, aimY: 0 }), hold({}), hold({})]);
    let blocks = 0;
    for (let i = 0; i < 4; i++) {
      const ev = sim.step([hold({ attack: i === 0, aimX: 1, aimY: 0 }), hold({ block: true, aimX: -1, aimY: 0 }), hold({}), hold({})]);
      blocks += ev.filter((e) => e.type === 'block').length;
    }
    expect(blocks).toBe(1);
    expect(b.get(Health)?.hp).toBe(100);
    expect(a.get(Combat)?.stun ?? 0).toBeGreaterThan(10);
    // Staggered: a second swing does nothing until the stun runs out.
    const ev = sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(ev.some((e) => e.type === 'punch')).toBe(false);
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
    const sim = makeSim({ seed: 8, settings: { playerCount: 2 }, skipCountdown: false });
    sim.step();
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Countdown);
    for (let i = 0; i < 200; i++) sim.step();
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);
  });

  it('nobody takes damage during the countdown', () => {
    const sim = makeSim({ level: woodsClearing, seed: 5, settings: { playerCount: 2, bots: 0 }, skipCountdown: false });
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
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Countdown);
    expect(b.get(Health)?.hp ?? 100).toBe(before);
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
    const sim = makeSim({ level: woodsClearing, seed: 10, settings: { playerCount: 2, firstTo: 1 } });
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
    const sim = makeSim({ level: woodsClearing, seed: 11, settings: { playerCount: 2, firstTo: 0 } });
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
});
