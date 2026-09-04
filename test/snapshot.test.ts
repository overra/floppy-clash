import { describe, expect, it } from 'vitest';
import { hashWorld, restoreWorld, serializeWorld } from '../src/sim/snapshot';
import { hold, makeSim } from './helpers';

describe('M8 snapshot', () => {
  it('round-trips transforms and rng', () => {
    const sim = makeSim({ seed: 77, settings: { playerCount: 2 } });
    for (let i = 0; i < 80; i++) sim.step([hold({ moveX: 1 }), hold({ moveX: -1 }), hold({}), hold({})]);
    const snap = serializeWorld(sim.ecs);
    const hash = hashWorld(sim.ecs);
    restoreWorld(sim.ecs, snap);
    expect(serializeWorld(sim.ecs).rng).toBe(snap.rng);
    expect(hashWorld(sim.ecs)).toBe(hash);
    expect(snap.entities.length).toBeGreaterThan(0);
  });
});
