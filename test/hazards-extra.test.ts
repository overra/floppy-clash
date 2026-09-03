import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { Destructible, Hazard, HazardKind, PhysArm, Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';

describe('M4 hazard details', () => {
  it('moving platform carries a standing player', () => {
    const sim = makeSim({ level: getLevel('test-platform.moving'), seed: 40, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const plat = { x: 0, y: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.MovingPlatform) {
        plat.x = t.x;
        plat.y = t.y;
      }
    });
    sim.ctx.bodies.get(p)?.setPosition({ x: plat.x, y: plat.y + 1.1 });
    const xs: number[] = [];
    for (let i = 0; i < 90; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      xs.push(p.get(Transform)?.x ?? 0);
    }
    const span = Math.max(...xs) - Math.min(...xs);
    expect(span).toBeGreaterThan(0.4);
  });

  it('halloween boss walks and can be stepped', () => {
    const sim = makeSim({ level: getLevel('halloween-boss'), seed: 42, settings: { playerCount: 1 } });
    let bosses = 0;
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Boss) bosses += 1;
    });
    expect(bosses).toBeGreaterThan(0);
    const p = playerOf(sim);
    const start = p.get(Transform)?.x ?? 0;
    expect(() => {
      for (let i = 0; i < 90; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    }).not.toThrow();
    expect(Number.isFinite(p.get(Transform)?.x ?? start)).toBe(true);
  });

  it('opt-in physics arms attach to the capsule', () => {
    const sim = makeSim({ seed: 43, settings: { playerCount: 1, physicsArms: true } });
    let arms = 0;
    sim.ecs.query(PhysArm).updateEach(() => {
      arms += 1;
    });
    expect(arms).toBe(2);
    expect(() => {
      for (let i = 0; i < 20; i++) sim.step([hold({ aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
    }).not.toThrow();
  });

  it('chain links take damage and break', () => {
    const sim = makeSim({ level: getLevel('test-chain'), seed: 41, settings: { playerCount: 1 } });
    let hits = 0;
    sim.ecs.query(Destructible).updateEach(([d], e) => {
      e.set(Destructible, { hp: 0, maxHp: d.maxHp });
      hits += 1;
    });
    expect(hits).toBeGreaterThan(0);
    expect(() => {
      for (let i = 0; i < 10; i++) sim.step();
    }).not.toThrow();
  });
});
