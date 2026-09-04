import { universe } from 'koota';
import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';
import { woodsClearing } from '../src/levels/handauthored';
import {
  acceptFrames,
  checkHash,
  clientSteps,
  createInputSender,
  createOnlineMatch,
  createRemoteInputs,
  pacingScale,
} from '../src/net/online';
import {
  mergePresses,
  packInput,
  unpackInput,
  wireInput,
  type PackedInput,
} from '../src/net/protocol';
import { cleanPeerName, isRoomCode, normalizeRoomCode, randomRoomCode } from '../src/net/relay';
import { blankInputs, type PlayerInput } from '../src/sim/input';
import { createSimWorld } from '../src/sim/world';
import { hold } from './helpers';

describe('online protocol: input packing', () => {
  it('round-trips through the wire to bit-identical doubles', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 500; i++) {
      const raw: PlayerInput = {
        moveX: rng.next() * 2.4 - 1.2,
        aimX: (rng.next() - 0.5) * 30,
        aimY: (rng.next() - 0.5) * 30,
        jump: rng.next() < 0.3,
        down: rng.next() < 0.3,
        attack: rng.next() < 0.3,
        block: rng.next() < 0.3,
        throw: rng.next() < 0.3,
      };
      const packed = packInput(raw);
      // What the host steps with is exactly what a client rebuilds from the same integers.
      const host = unpackInput(packed);
      const client = unpackInput(JSON.parse(JSON.stringify(packed)) as PackedInput);
      expect(client).toEqual(host);
      expect(wireInput(raw)).toEqual(host);
      expect(Math.abs(host.moveX)).toBeLessThanOrEqual(1);
      expect(Math.hypot(host.aimX, host.aimY)).toBeCloseTo(1, 2);
      for (const k of ['jump', 'down', 'attack', 'block', 'throw'] as const)
        expect(host[k]).toBe(raw[k]);
    }
  });

  it('keeps a neutral aim pointing right and tolerates garbage', () => {
    expect(unpackInput(packInput(hold({ aimX: 0, aimY: 0 })))).toMatchObject({ aimX: 1, aimY: 0 });
    expect(
      unpackInput(packInput(hold({ moveX: Number.NaN, aimX: Number.POSITIVE_INFINITY }))),
    ).toMatchObject({ moveX: 0 });
    expect(unpackInput([Number.NaN, undefined, 'x', 7] as unknown as PackedInput)).toMatchObject({
      moveX: 0,
      aimX: 0,
      aimY: 0,
      jump: true,
      down: true,
      attack: true,
    });
  });

  it('merges presses but takes the latest analog state', () => {
    const merged = mergePresses([1000, 0, 1000, 0], [-1000, 1000, 0, 1 | 4]);
    expect(merged).toEqual([1000, 0, 1000, 5]);
  });
});

describe('online: host-side remote inputs', () => {
  it('applies one queued input per tick and holds the last one', () => {
    const remote = createRemoteInputs(2);
    const a = packInput(hold({ moveX: 1 }));
    const b = packInput(hold({ moveX: -1 }));
    remote.push(1, a);
    remote.push(1, b);
    expect(remote.take(1)).toBe(a);
    expect(remote.take(1)).toBe(b);
    expect(remote.take(1)).toBe(b);
    expect(unpackInput(remote.take(0))).toEqual(blankInputs(1)[0]);
  });

  it('never loses a tap when catching up a backlog, and still applies the release', () => {
    const remote = createRemoteInputs(1);
    remote.push(0, packInput(hold({ moveX: 0.5 })));
    remote.push(0, packInput(hold({ jump: true })));
    remote.push(0, packInput(hold({ attack: true })));
    remote.push(0, packInput(hold({})));
    remote.push(0, packInput(hold({ moveX: -1 })));
    const first = unpackInput(remote.take(0));
    expect(first.jump).toBe(true);
    expect(first.attack).toBe(true);
    const second = unpackInput(remote.take(0));
    expect(second.jump).toBe(false);
    expect(second.moveX).toBe(-1);
    expect(remote.pending(0)).toBe(0);
  });

  it('clears to a blank input when the peer leaves', () => {
    const remote = createRemoteInputs(1);
    remote.push(0, packInput(hold({ attack: true })));
    remote.take(0);
    remote.clear(0);
    expect(unpackInput(remote.take(0))).toEqual(blankInputs(1)[0]);
  });
});

describe('online: client input sender', () => {
  it('sends only on change, at most once per tick, and folds taps between sends', () => {
    const sent: PackedInput[] = [];
    const sender = createInputSender((p) => sent.push(p));
    sender.update(hold({}), 0);
    expect(sent).toHaveLength(1);
    sender.update(hold({}), 5);
    sender.update(hold({}), 40);
    expect(sent).toHaveLength(1);
    sender.update(hold({ moveX: 1 }), 41);
    expect(sent).toHaveLength(2);
    // A jump pressed and released inside the send interval still reaches the host.
    sender.update(hold({ moveX: 1, jump: true }), 45);
    sender.update(hold({ moveX: 1 }), 50);
    expect(sent).toHaveLength(2);
    sender.update(hold({ moveX: 1 }), 60);
    expect(sent).toHaveLength(3);
    expect(unpackInput(sent[2]!).jump).toBe(true);
    // ...and the release follows once the interval allows it.
    sender.update(hold({ moveX: 1 }), 80);
    expect(sent).toHaveLength(4);
    expect(unpackInput(sent[3]!).jump).toBe(false);
  });
});

describe('online: client pacing', () => {
  it('steps only what it has and bursts through a big backlog', () => {
    expect(clientSteps(1, 0)).toBe(0);
    expect(clientSteps(2, 1)).toBe(1);
    expect(clientSteps(1, 3)).toBe(1);
    expect(clientSteps(1, 40)).toBe(10);
    expect(clientSteps(1, 400)).toBe(60);
    expect(clientSteps(1, 32)).toBe(10);
  });

  it('leans the clock toward the buffer target', () => {
    expect(pacingScale(0)).toBeLessThan(1);
    expect(pacingScale(3)).toBe(1);
    expect(pacingScale(5)).toBeGreaterThan(1);
    expect(pacingScale(9)).toBeGreaterThan(pacingScale(5));
  });

  it('files frames in order, flags gaps and checks hashes once', () => {
    const m = createOnlineMatch(
      'client',
      [
        { peer: 1, name: 'h', color: 0 },
        { peer: 2, name: 'c', color: 1 },
      ],
      2,
      () => undefined,
    );
    expect(m.localSlot).toBe(1);
    const frame = [packInput(hold({})), packInput(hold({ moveX: 1 }))];
    expect(acceptFrames(m, 0, [frame, frame])).toBe(true);
    expect(acceptFrames(m, 2, [frame], { tick: 3, h: 'abc' })).toBe(true);
    expect(m.inbox).toHaveLength(3);
    expect(m.inbox[0]![1]!.moveX).toBe(1);
    expect(checkHash(m, 2, () => 'zzz')).toBeNull();
    expect(checkHash(m, 3, () => 'abc')).toBe(true);
    expect(m.lastHashOk).toBe(3);
    expect(checkHash(m, 3, () => 'abc')).toBeNull();
    expect(acceptFrames(m, 9, [frame])).toBe(false);
    expect(acceptFrames(m, 10, [frame], { tick: 11, h: 'q' })).toBe(true);
    expect(checkHash(m, 11, () => 'not-q')).toBe(false);
  });
});

describe('online: room codes and names', () => {
  it('normalizes and validates codes', () => {
    expect(normalizeRoomCode(' k7-pq2 ')).toBe('K7PQ2');
    expect(isRoomCode('K7PQ2')).toBe(true);
    expect(isRoomCode('abc')).toBe(false);
    expect(isRoomCode('TOOLONGCODE')).toBe(false);
    const rng = new SeededRng(3);
    for (let i = 0; i < 50; i++) expect(isRoomCode(randomRoomCode(() => rng.next()))).toBe(true);
  });

  it('cleans names', () => {
    expect(cleanPeerName('  Ada\u0000 Lovelace  ')).toBe('Ada Lovelace');
    expect(cleanPeerName('')).toBe('Player');
    expect(cleanPeerName('x'.repeat(40))).toHaveLength(20);
  });
});

describe('online: host and client mirrors agree', () => {
  it('two sims stepping the same wire inputs hash identically for a whole noisy match', () => {
    const level = woodsClearing;
    universe.reset();
    const make = () =>
      createSimWorld({
        level,
        seed: 4242,
        settings: { playerCount: 2, bots: 2, firstTo: 0, maxHp: 60 },
      });
    // The host and a client are created the way game.ts creates them online: same seed, level, rules.
    const host = make();
    const client = make();
    const rng = new SeededRng(11);
    const remote = createRemoteInputs(4);
    const frames: PackedInput[][] = [];
    for (let tick = 0; tick < 1800; tick++) {
      // The client mashes buttons and wiggles its stick; its messages queue up on the host.
      if (rng.next() < 0.6) {
        remote.push(
          1,
          packInput({
            moveX: rng.next() * 2 - 1,
            aimX: rng.next() * 2 - 1,
            aimY: rng.next() * 2 - 1,
            jump: rng.next() < 0.2,
            down: rng.next() < 0.1,
            attack: rng.next() < 0.4,
            block: rng.next() < 0.1,
            throw: rng.next() < 0.05,
          }),
        );
      }
      const hostRaw = hold({
        moveX: Math.sin(tick / 30),
        aimX: Math.cos(tick / 17),
        aimY: Math.sin(tick / 23),
        attack: tick % 7 === 0,
      });
      const packed: PackedInput[] = [
        packInput(hostRaw),
        remote.take(1),
        packInput(hold({})),
        packInput(hold({})),
      ];
      host.step(packed.map(unpackInput));
      frames.push(packed);
    }
    // The client receives the frames (through JSON, like the relay) and steps them.
    const wire = JSON.parse(JSON.stringify(frames)) as PackedInput[][];
    for (const frame of wire) client.step(frame.map(unpackInput));
    expect(client.getTick()).toBe(host.getTick());
    expect(client.hash()).toBe(host.hash());
  });
});
