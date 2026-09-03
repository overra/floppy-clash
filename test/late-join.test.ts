import { describe, expect, it } from 'vitest';
import { createClientView, snapshotCanOpenClientView } from '../src/net/clientView';
import { enqueuePendingSnap, extrasAfterOpen, takeOpenableFromQueue } from '../src/net/lateJoinBuffer';
import { accumulateScoreboardTicks } from '../src/net/scoreboardTicks';
import { RoundPhase } from '../src/sim/traits';
import { parseLevel } from '../src/sim/level/schema';
import type { WorldSnapshot } from '../src/sim/snapshot';
import { hold, makeSim } from './helpers';

function bareSnap(partial: Partial<WorldSnapshot> & Pick<WorldSnapshot, 'tick'>): WorldSnapshot {
  return {
    rng: 0,
    nextId: 1,
    entities: [],
    full: true,
    ...partial,
  };
}

const custom = parseLevel({
  id: 'late-custom',
  name: 'Late Custom',
  theme: 'arena',
  bounds: { x: 0, y: 0, w: 36, h: 16 },
  spawns: [
    { x: 4, y: 8 },
    { x: 32, y: 8 },
    { x: 10, y: 8 },
    { x: 26, y: 8 },
  ],
  objects: [{ type: 'solid', x: 18, y: 1, w: 36, h: 2 }],
});

describe('late-join snap buffer (no e2e later-snap OR)', () => {
  it('queues a custom-level full snap until host JSON is present', () => {
    const snap = bareSnap({ tick: 40, levelId: 'late-custom' });
    expect(snapshotCanOpenClientView(snap)).toBe(false);
    expect(snapshotCanOpenClientView(snap, custom)).toBe(true);
    const queued = enqueuePendingSnap([], snap);
    expect(takeOpenableFromQueue(queued)).toBeNull();
    const taken = takeOpenableFromQueue(queued, custom);
    expect(taken?.opened.tick).toBe(40);
    expect(taken?.extras).toEqual([]);
  });

  it('deltas cannot open a view; a later full snap opens and keeps newer extras', () => {
    const delta = bareSnap({ tick: 10, levelId: 'gym', full: false });
    const full = bareSnap({ tick: 20, levelId: 'gym' });
    const newer = bareSnap({ tick: 30, levelId: 'gym' });
    const older = bareSnap({ tick: 15, levelId: 'gym' });
    let queue = enqueuePendingSnap([], delta);
    queue = enqueuePendingSnap(queue, full);
    queue = enqueuePendingSnap(queue, older);
    queue = enqueuePendingSnap(queue, newer);
    expect(snapshotCanOpenClientView(delta)).toBe(false);
    const taken = takeOpenableFromQueue(queue);
    expect(taken?.opened.tick).toBe(20);
    expect(taken?.extras.map((s) => s.tick)).toEqual([30]);
  });

  it('opening from an incoming full snap keeps newer queued extras (does not wipe)', () => {
    const queuedNewer = bareSnap({ tick: 80, levelId: 'gym' });
    const incoming = bareSnap({ tick: 50, levelId: 'gym' });
    const extras = extrasAfterOpen([queuedNewer], incoming);
    expect(extras.map((s) => s.tick)).toEqual([80]);
  });

  it('caps the pending queue at 8', () => {
    let queue: WorldSnapshot[] = [];
    for (let i = 0; i < 12; i++) queue = enqueuePendingSnap(queue, bareSnap({ tick: i, levelId: 'gym' }));
    expect(queue).toHaveLength(8);
    expect(queue[0]?.tick).toBe(4);
    expect(queue[7]?.tick).toBe(11);
  });

  it('flush after level JSON applies the opening snap and newer extras onto a view', () => {
    const host = makeSim({ seed: 61, settings: { playerCount: 2 } });
    for (let i = 0; i < 20; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const first = host.snapshot();
    for (let i = 0; i < 24; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const second = host.snapshot();
    expect(second.tick).toBeGreaterThan(first.tick);

    const customFirst = { ...first, levelId: 'late-custom' };
    const customSecond = { ...second, levelId: 'late-custom' };
    expect(snapshotCanOpenClientView(customFirst)).toBe(false);
    let queue = enqueuePendingSnap([], customFirst);
    queue = enqueuePendingSnap(queue, customSecond);
    const taken = takeOpenableFromQueue(queue, custom);
    expect(taken).toBeTruthy();
    const view = createClientView(taken!.opened, 120, custom);
    const t0 = 0;
    view.push(t0, taken!.opened);
    taken!.extras.forEach((snap, i) => view.push(t0 + (i + 1) * 16, snap));
    view.apply(t0 + taken!.extras.length * 16 + 120);
    expect(view.restored).toBe(true);
    expect(view.appliedTick).toBe(second.tick);
    expect(view.sim.ctx.level.id).toBe('late-custom');
  });

  it('client view push drops an older same-level snap (no rewind)', () => {
    const host = makeSim({ seed: 62, settings: { playerCount: 2 } });
    const early = host.snapshot();
    for (let i = 0; i < 30; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const late = host.snapshot();
    expect(late.tick).toBeGreaterThan(early.tick);
    const view = createClientView(late, 100);
    view.push(0, late);
    view.push(50, early);
    view.apply(160);
    expect(view.appliedTick).toBe(late.tick);
    expect(view.appliedTick).not.toBe(early.tick);
  });
});

describe('client scoreboard tick accumulator (no render-rate OR)', () => {
  it('counts host tick deltas, ignores same-tick re-apply, and does not accept a single end snap', () => {
    let seen = 0;
    let cursor = null as ReturnType<typeof accumulateScoreboardTicks>['cursor'] | null;
    const apply = (tick: number, phase: number) => {
      const next = accumulateScoreboardTicks(seen, cursor, { tick, phase });
      seen = next.seen;
      cursor = next.cursor;
    };
    apply(10, RoundPhase.Fighting);
    expect(seen).toBe(0);
    apply(100, RoundPhase.Scoreboard);
    expect(seen).toBe(1);
    apply(100, RoundPhase.Scoreboard);
    expect(seen).toBe(1);
    apply(103, RoundPhase.Scoreboard);
    apply(106, RoundPhase.Scoreboard);
    apply(189, RoundPhase.Scoreboard);
    expect(seen).toBe(90);
    apply(190, RoundPhase.Loading);
    expect(seen).toBe(90);

    const oneShot = accumulateScoreboardTicks(0, { tick: 10, phase: RoundPhase.Fighting }, {
      tick: 189,
      phase: RoundPhase.Scoreboard,
    });
    expect(oneShot.seen).toBe(1);
  });
});
