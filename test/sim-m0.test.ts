import { describe, expect, it } from 'vitest';
import { gymLevel } from '../src/levels/gym';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Loose, Weapon } from '../src/sim/traits';
import { createSimWorld } from '../src/sim/world';
import { hold, makeSim, pos, stepMany } from './helpers';

describe('M0 scaffold', () => {
  it('steps 600 ticks and boxes come to rest', () => {
    const sim = createSimWorld({
      level: gymLevel,
      seed: 7,
      settings: { playerCount: 0, bots: 0 },
      spawnPlayers: false,
      boxes: 12,
    });
    for (let i = 0; i < 600; i++) sim.step();
    const h1 = sim.hash();
    let maxSpeed = 0;
    sim.ctx.bodies.forEach((body) => {
      if (body.getType() !== 'dynamic') return;
      const v = body.getLinearVelocity();
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y));
    });
    expect(maxSpeed).toBeLessThan(0.35);
    for (let i = 0; i < 30; i++) sim.step();
    const h2 = sim.hash();
    expect(h1).toBeTypeOf('string');
    expect(h1.length).toBe(8);
    expect(Number.isFinite(Number.parseInt(h2, 16))).toBe(true);
  });

  it('golden state hash is stable across runs', () => {
    const run = () => {
      const sim = makeSim({ seed: 99, settings: { playerCount: 2, bots: 0 }, boxes: 4 });
      for (let i = 0; i < 600; i++) {
        const a = hold({ moveX: i % 40 < 20 ? 1 : -1, jump: i % 45 === 0, attack: i % 33 === 0 });
        const b = hold({ moveX: i % 30 < 10 ? -1 : 0.4, block: i % 50 < 8 });
        sim.step([a, b, hold({}), hold({})]);
      }
      return sim.hash();
    };
    const hash = run();
    expect(hash).toBe(run());
    // Deliberate pin — update only when a sim change is intentional (PLAN §6).
    expect(hash).toBe('47edeca9');
  });

  it('golden hash with scripted spawns/destroys is stable', () => {
    const run = () => {
      const sim = makeSim({ seed: 44, settings: { playerCount: 2, bots: 0 }, boxes: 2 });
      for (let i = 0; i < 200; i++) {
        if (i === 20) spawnWeapon(sim.ecs, 'pistol', 10, 8);
        if (i === 80) {
          sim.ecs.query(Weapon).updateEach((_, e) => {
            if (e.has(Loose)) sim.ctx.pendingDestroy.push(e);
          });
        }
        sim.step([
          hold({ moveX: i % 16 < 8 ? 1 : -1, jump: i % 40 === 0 }),
          hold({}),
          hold({}),
          hold({}),
        ]);
      }
      return sim.hash();
    };
    const hash = run();
    expect(hash).toBe(run());
    expect(hash).toBe('05437460');
  });

  it('player transform stays finite', () => {
    const sim = makeSim();
    stepMany(sim, 120, hold({ moveX: 1 }));
    const p = pos(sim);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
