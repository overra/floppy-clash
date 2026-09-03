import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { Transform } from '../src/sim/traits';
import { hold, makeSim } from './helpers';

describe('fuzz / soak', () => {
  it('20000 scripted random ticks produce no NaNs or exceptions', { timeout: 120_000 }, () => {
    const sim = makeSim({ seed: 4242, settings: { playerCount: 4, bots: 0 }, boxes: 6 });
    const rng = new SeededRng(4242);
    expect(() => {
      for (let i = 0; i < 20000; i++) {
        sim.step([
          hold({
            moveX: rng.range(-1, 1),
            jump: rng.next() < 0.08,
            down: rng.next() < 0.05,
            attack: rng.next() < 0.1,
            block: rng.next() < 0.08,
            throw: rng.next() < 0.02,
            aimX: rng.range(-1, 1),
            aimY: rng.range(-1, 1),
          }),
          hold({ moveX: rng.range(-1, 1), jump: rng.next() < 0.05, attack: rng.next() < 0.08, aimX: -1, aimY: 0.2 }),
          hold({ moveX: rng.range(-1, 1), block: rng.next() < 0.1 }),
          hold({ moveX: rng.range(-1, 1), attack: rng.next() < 0.1, throw: rng.next() < 0.03 }),
        ]);
      }
    }).not.toThrow();
    sim.ecs.query(Transform).updateEach(([t]) => {
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
      expect(Number.isFinite(t.angle)).toBe(true);
    });
    expect(sim.ctx.bodies.size).toBeLessThan(400);
    expect(sim.ctx.lastPhysicsMs).toBeLessThan(80);
  });
});
