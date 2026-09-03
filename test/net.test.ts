import { describe, expect, it } from 'vitest';
import { createInterpBuffer } from '../src/net/interp';
import { applyInputBundle, bundleInputs, createSimulatedLink } from '../src/net/simnet';
import {
  decode,
  decodeSnapshotBinary,
  decodeWire,
  encode,
  encodeSnapshotBinary,
  encodeWire,
  hostContentMessages,
  lateJoinSnapshotMessage,
  snapshotBytes,
  wireBytes,
} from '../src/net/protocol';
import { createLocalLoopback, PUBLIC_ICE_SERVERS } from '../src/net/transport';
import { drainChangeTrackers } from '../src/sim/snapshot';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Held, HeldBy, Loose, NetId, Weapon } from '../src/sim/traits';
import { createClientView } from '../src/net/clientView';
import { parseLevel } from '../src/sim/level/schema';
import { SeededRng } from '../src/core/rng';
import { blankInputs } from '../src/sim/input';
import { Health, MatchState, RoundPhase, RoundState } from '../src/sim/traits';
import { hold, makeSim, playerOf, pos } from './helpers';

describe('M8 netcode', () => {
  it('configures public STUN (PLAN 4.13)', () => {
    expect(PUBLIC_ICE_SERVERS.some((s) => String(s.urls).startsWith('stun:'))).toBe(true);
  });

  it('binary snapshot round-trips quantized BodyVel and world traits', () => {
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
    expect(decoded.levelId).toBe('gym');
    expect(decoded.full).toBe(true);
    expect(decoded.playerCount).toBe(2);
    expect(decoded.entities.length).toBe(snap.entities.length);
  });

  it('encodeWire puts snapshots on a binary payload, not JSON', () => {
    const host = makeSim({ settings: { playerCount: 2 } });
    const snap = host.snapshot();
    const wire = encodeWire({ t: 'snapshot', snap });
    expect(wire).toBeInstanceOf(Uint8Array);
    expect((wire as Uint8Array)[0]).toBe(2);
    expect(typeof encodeWire({ t: 'chat', from: 'a', text: 'hi' })).toBe('string');
    const back = decodeWire(wire);
    expect(back.t).toBe('snapshot');
    if (back.t !== 'snapshot') throw new Error('expected snapshot');
    expect(back.snap.levelId).toBe('gym');
    expect(decodeWire(encode({ t: 'snapshot', snap })).t).toBe('snapshot');
  });

  it('loopback session encode→wire→decode restores a held weapon', () => {
    const host = makeSim({ seed: 77, settings: { playerCount: 2 } });
    const gun = spawnWeapon(host.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(playerOf(host, 0)));
    gun.remove(Loose);
    host.step([hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    const snap = host.snapshot();
    const session = createLocalLoopback();
    let got = snap;
    session.onMessage((msg) => {
      if (msg.t === 'snapshot') got = msg.snap;
    });
    session.send({ t: 'snapshot', snap });
    expect(session.bytesOut).toBe(snapshotBytes(snap));
    expect(session.bytesOut).toBeLessThan(JSON.stringify(snap).length);
    const view = createClientView(got);
    let held = false;
    view.sim.ecs.query(Weapon, NetId).updateEach(([_w, n], e) => {
      if (n.id === gun.get(NetId)!.id) held = e.has(Held);
    });
    expect(held).toBe(true);
  });

  it('delta snapshots keep added/removed and stay smaller than full', () => {
    const host = makeSim({ seed: 78, settings: { playerCount: 2 } });
    const full = host.snapshot();
    drainChangeTrackers(host.ecs);
    spawnWeapon(host.ecs, 'pistol', 10, 8);
    for (let i = 0; i < 12; i++) host.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const delta = host.snapshotDelta();
    expect(delta.full).toBe(false);
    const decoded = decodeSnapshotBinary(encodeSnapshotBinary(delta));
    expect(decoded.full).toBe(false);
    expect(decoded.added?.length).toBeGreaterThan(0);
    expect(snapshotBytes(delta)).toBeLessThan(snapshotBytes(full));
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
        const full = i % 60 === 0;
        const snap = full ? host.snapshot() : host.snapshotDelta();
        if (full) drainChangeTrackers(host.ecs);
        bytes += wireBytes({ t: 'snapshot', snap });
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
