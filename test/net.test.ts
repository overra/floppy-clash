import { describe, expect, it } from 'vitest';
import { createInterpBuffer } from '../src/net/interp';
import { applyInputBundle, bundleInputs, createSimulatedLink } from '../src/net/simnet';
import {
  decode,
  decodeSnapshotBinary,
  encode,
  encodeSnapshotBinary,
  hostContentMessages,
  lateJoinSnapshotMessage,
  snapshotBytes,
} from '../src/net/protocol';
import { PUBLIC_ICE_SERVERS } from '../src/net/transport';
import { parseLevel } from '../src/sim/level/schema';
import { SeededRng } from '../src/core/rng';
import { blankInputs } from '../src/sim/input';
import { Health, MatchState, RoundPhase, RoundState } from '../src/sim/traits';
import { hold, makeSim, playerOf, pos } from './helpers';

describe('M8 netcode', () => {
  it('configures public STUN (PLAN 4.13)', () => {
    expect(PUBLIC_ICE_SERVERS.some((s) => String(s.urls).startsWith('stun:'))).toBe(true);
  });

  it('binary snapshot round-trips quantized BodyVel', () => {
    const host = makeSim({ settings: { playerCount: 2 } });
    const snap = host.snapshot();
    const rec = snap.entities.find((e) => e.traits.Player);
    if (rec) rec.traits.BodyVel = { vx: 6.25, vy: -2.5, omega: 1.3 };
    const decoded = decodeSnapshotBinary(encodeSnapshotBinary(snap));
    const got = decoded.entities.find((e) => e.netId === rec?.netId);
    expect(Number(got?.traits.BodyVel?.vx)).toBeCloseTo(6.25, 2);
    expect(Number(got?.traits.BodyVel?.vy)).toBeCloseTo(-2.5, 2);
    expect(Number(got?.traits.BodyVel?.omega)).toBeCloseTo(1.3, 2);
    expect(decoded.tick).toBe(snap.tick);
  });

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

  it('host applies a remote 3-input bundle to the matching seat', () => {
    const host = makeSim({ settings: { playerCount: 2 } });
    const x0 = pos(host, 1).x;
    const bundle = bundleInputs([hold({ moveX: 1 }), hold({ moveX: 1 }), hold({ moveX: 1 })]);
    for (let i = 0; i < 36; i++) {
      const inputs = applyInputBundle([hold({}), hold({}), hold({}), hold({})], 1, bundle);
      host.step(inputs);
    }
    expect(pos(host, 1).x).toBeGreaterThan(x0 + 0.4);
  });

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

  it('custom level JSON survives encode → decode → parseLevel', () => {
    const custom = parseLevel({
      id: 'net-custom',
      name: 'Net Custom',
      theme: 'arena',
      bounds: { x: 0, y: 0, w: 40, h: 18 },
      spawns: [
        { x: 4, y: 8 },
        { x: 36, y: 8 },
        { x: 12, y: 8 },
        { x: 28, y: 8 },
      ],
      objects: [{ type: 'solid', x: 20, y: 1, w: 40, h: 2 }],
    });
    const msgs = hostContentMessages(JSON.stringify({ maxHp: 80, firstTo: 5 }), JSON.stringify(custom));
    const levelMsg = msgs[1]!;
    expect(levelMsg.t).toBe('level');
    const roundTrip = decode(encode(levelMsg));
    expect(roundTrip.t).toBe('level');
    const parsed = parseLevel(JSON.parse(roundTrip.t === 'level' ? roundTrip.json : '{}'));
    expect(parsed.id).toBe('net-custom');
    expect(parsed.bounds.h).toBe(18);
  });
});
