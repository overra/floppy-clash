import { describe, expect, it } from 'vitest';
import { applyLateJoinSnapshot, createClientView } from '../src/net/clientView';
import { createInterpBuffer } from '../src/net/interp';
import { netShapeFromSearch } from '../src/net/shape';
import { PrevTransform, Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf, pos } from './helpers';

describe('client interpolation view', () => {
  it('restoreWorld drives a client view from late-join snapshots', () => {
    const host = makeSim({ seed: 11, settings: { playerCount: 2 } });
    for (let i = 0; i < 40; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const snapA = host.snapshot();
    const xA = pos(host, 0).x;
    for (let i = 0; i < 40; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const snapB = host.snapshot();
    const xB = pos(host, 0).x;
    expect(xB).toBeGreaterThan(xA);
    expect(snapA.levelId).toBe('gym');
    expect(snapA.playerCount).toBe(2);

    const view = createClientView(snapA);
    expect(view.restored).toBe(true);
    expect(view.appliedTick).toBe(snapA.tick);
    expect(playerOf(view.sim, 0).get(Transform)?.x ?? 0).toBeCloseTo(xA, 2);

    applyLateJoinSnapshot(view.sim, snapB, snapA);
    expect(playerOf(view.sim, 0).get(Transform)?.x ?? 0).toBeCloseTo(xB, 2);
    expect(playerOf(view.sim, 0).get(PrevTransform)?.x ?? 0).toBeCloseTo(xA, 2);
  });

  it('interp buffer delay applies the late-join snapshot onto the client sim', () => {
    const host = makeSim({ seed: 12, settings: { playerCount: 2 } });
    for (let i = 0; i < 30; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const snapA = host.snapshot();
    const xA = pos(host, 0).x;
    for (let i = 0; i < 40; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const snapB = host.snapshot();
    const xB = pos(host, 0).x;

    const view = createClientView(snapA, 100);
    view.push(0, snapA);
    view.push(50, snapB);
    const applied = view.apply(160);
    expect(applied?.tick).toBe(snapB.tick);
    expect(view.appliedTick).toBe(snapB.tick);
    expect(view.appliedX).toBeCloseTo(xB, 2);
    expect(view.restored).toBe(true);
    expect(xA).toBeLessThan(xB);
  });

  it('samplePair returns from/to around the interpolation delay', () => {
    const buf = createInterpBuffer(100);
    const host = makeSim({ settings: { playerCount: 2 } });
    buf.push(0, host.snapshot());
    host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    buf.push(50, host.snapshot());
    const pair = buf.samplePair(160);
    expect(pair).toBeTruthy();
    expect(pair!.to.tick).toBeGreaterThanOrEqual(pair!.from.tick);
    expect(pair!.alpha).toBeGreaterThanOrEqual(0);
    expect(pair!.alpha).toBeLessThanOrEqual(1);
  });

  it('parses ?net=100,2 loss shaping', () => {
    expect(netShapeFromSearch('?net=100,2')).toEqual({ latencyMs: 100, loss: 0.02 });
    expect(netShapeFromSearch('lag=40&loss=0.05')).toEqual({ latencyMs: 40, loss: 0.05 });
  });
});
