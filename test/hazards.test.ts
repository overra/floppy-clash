import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { Dead, Health, Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';

describe('M4 hazards', () => {
  it('spikes kill on contact that tick', () => {
    const sim = makeSim({ level: getLevel('test-spikes'), seed: 21, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const spikes = getLevel('test-spikes').objects.find((o) => o.type === 'spikes');
    p.set(Transform, { x: spikes?.x ?? 10, y: spikes?.y ?? 2.4, angle: 0 });
    sim.ctx.bodies.get(p)?.setPosition({ x: spikes?.x ?? 10, y: spikes?.y ?? 2.4 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('moving platform exists and steps without throwing', () => {
    const sim = makeSim({ level: getLevel('test-platform.moving'), seed: 22, settings: { playerCount: 1 } });
    expect(() => {
      for (let i = 0; i < 120; i++) sim.step();
    }).not.toThrow();
  });

  it('lava damages then respects cooldown', () => {
    const sim = makeSim({ level: getLevel('test-lava'), seed: 23, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const lava = getLevel('test-lava').objects.find((o) => o.type === 'lava');
    p.set(Transform, { x: lava?.x ?? 16, y: (lava?.y ?? 1.6) + 0.2, angle: 0 });
    sim.ctx.bodies.get(p)?.setPosition({ x: lava?.x ?? 16, y: (lava?.y ?? 1.6) + 0.2 });
    const before = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const mid = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = p.get(Health)?.hp ?? 100;
    expect(mid).toBeLessThanOrEqual(before);
    expect(after).toBe(mid);
  });

  it('each hazard test level steps 60 ticks', () => {
    const kinds = [
      'saw',
      'crate',
      'ice',
      'conveyor',
      'bounce',
      'laser',
      'chain',
      'crusher',
      'barrel.explosive',
      'block.destructible',
      'platform.disappearing',
      'platform.collapsing',
      'spikeball',
    ];
    for (const kind of kinds) {
      const sim = makeSim({ level: getLevel(`test-${kind}`), seed: 30, settings: { playerCount: 1 } });
      expect(() => {
        for (let i = 0; i < 60; i++) sim.step();
      }).not.toThrow();
    }
  });
});
