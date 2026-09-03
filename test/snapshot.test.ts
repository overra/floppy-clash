import { describe, expect, it } from 'vitest';
import { createClientView } from '../src/net/clientView';
import {
  drainChangeTrackers,
  hashWorld,
  mergeSnapshot,
  restoreWorld,
  serializeDelta,
  serializeWorld,
} from '../src/sim/snapshot';
import { hold, makeSim, pos } from './helpers';

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
    expect(snap.full).toBe(true);
  });

  it('Changed(Transform) delta is smaller than a full snap and still restores motion', () => {
    const host = makeSim({ seed: 81, settings: { playerCount: 2 } });
    const full0 = host.snapshot();
    drainChangeTrackers(host.ecs);
    for (let i = 0; i < 36; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const x1 = pos(host, 0).x;
    const full1 = host.snapshot();
    const delta = serializeDelta(host.ecs);
    expect(delta.full).toBe(false);
    expect(delta.entities.length).toBeLessThan(full1.entities.length);
    expect(delta.entities.length).toBeGreaterThan(0);
    const merged = mergeSnapshot(full0, delta);
    expect(merged.full).toBe(true);
    const view = createClientView(full0);
    view.push(0, full0);
    view.push(50, delta);
    view.apply(180);
    expect(view.appliedX).toBeCloseTo(x1, 1);
  });
});
