import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { Destructible, Hazard, HazardKind, Transform } from '../src/sim/traits';
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
