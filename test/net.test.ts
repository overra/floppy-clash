import { describe, expect, it } from 'vitest';
import { createInterpBuffer } from '../src/net/interp';
import { bundleInputs, createSimulatedLink } from '../src/net/simnet';
import { hostContentMessages, lateJoinSnapshotMessage, snapshotBytes } from '../src/net/protocol';
import { SeededRng } from '../src/core/rng';
import { blankInputs } from '../src/sim/input';
import { Health, MatchState, RoundPhase, RoundState } from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';

describe('M8 netcode', () => {
  it('bundles the last 3 inputs and interpolates snapshots', () => {
    const a = hold({ moveX: 1 });
    const b = hold({ moveX: -1 });
    const c = hold({ jump: true });
    const d = hold({ attack: true });
    expect(bundleInputs([a, b, c, d])).toHaveLength(3);
    const buf = createInterpBuffer(100);
    const sim = makeSim({ settings: { playerCount: 2 } });
    buf.push(0, sim.snapshot());
    sim.step();
    buf.push(50, sim.snapshot());
    expect(buf.sample(160)).toBeTruthy();
  });

  it('finishes a 10-round match at 100 ms / 2% loss under the 30 KB/s budget', () => {
    const rng = new SeededRng(99);
    const link = createSimulatedLink({ latencyMs: 100, loss: 0.02, rng: () => rng.next() });
    const host = makeSim({ settings: { playerCount: 4, firstTo: 0 } });
    host.ctx.tuning.countdownTicks = 3;
    host.ctx.tuning.slowmoTicks = 2;
    host.ctx.tuning.scoreboardTicks = 2;
    const delay = 6;
    const q: ReturnType<typeof blankInputs>[] = [];
    let bytes = 0;
    for (let i = 0; i < 6000; i++) {
      const raw = [hold({ moveX: 0.2 }), hold({}), hold({}), hold({})];
      q.push(raw);
      link.advance(1000 / 60);
      const dropped = rng.next() < 0.02;
      const delayed = q[Math.max(0, q.length - 1 - delay)] ?? raw;
      host.step(dropped ? (q[Math.max(0, q.length - 2 - delay)] ?? raw) : delayed);
      if (i % 3 === 0) {
        const snap = host.snapshot();
        bytes += snapshotBytes(snap);
        link.send(1, { t: 'snapshot', snap });
      }
      const phase = host.ecs.get(RoundState)?.phase;
      if (phase === RoundPhase.Fighting) {
        for (let s = 1; s < 4; s++) {
          const p = playerOf(host, s);
          if ((p.get(Health)?.hp ?? 0) > 0) p.set(Health, { hp: 0, maxHp: 100 });
        }
      }
      if ((host.ecs.get(MatchState)?.round ?? 0) >= 10) break;
    }
    const seconds = Math.max(1, host.ctx.tick / 60);
    const kBps = bytes / seconds / 1024;
    expect(host.ecs.get(MatchState)?.round ?? 0).toBeGreaterThanOrEqual(10);
    expect(kBps).toBeLessThan(30);
    expect(link.sent()).toBeGreaterThan(0);
  }, 60_000);

  it('host sends settings/level JSON and a late-join snapshot', () => {
    const host = makeSim({ settings: { playerCount: 2 } });
    const msgs = hostContentMessages(JSON.stringify({ maxHp: 50 }), JSON.stringify({ id: 'woods-01' }));
    expect(msgs[0]).toMatchObject({ t: 'settings' });
    expect(msgs[1]).toMatchObject({ t: 'level' });
    const late = lateJoinSnapshotMessage(host.snapshot());
    expect(late.t).toBe('snapshot');
    if (late.t !== 'snapshot') throw new Error('expected snapshot');
    expect(late.snap.entities.length).toBeGreaterThan(0);
  });
});
