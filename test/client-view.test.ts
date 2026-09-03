import { describe, expect, it } from 'vitest';
import {
  applyLateJoinSnapshot,
  createClientView,
  snapshotCanOpenClientView,
  worldFromSnapshot,
} from '../src/net/clientView';
import { createInterpBuffer } from '../src/net/interp';
import { decode, encode } from '../src/net/protocol';
import { netShapeFromSearch } from '../src/net/shape';
import { parseLevel } from '../src/sim/level/schema';
import { spawnWeapon } from '../src/sim/systems/weapons';
import {
  Combat,
  Health,
  Held,
  HeldBy,
  Loose,
  NetId,
  OwnedBy,
  PrevTransform,
  Projectile,
  RoundPhase,
  RoundState,
  Transform,
  Weapon,
} from '../src/sim/traits';
import { getLevel, hold, makeSim, playerOf, pos, speedRounds, woodsClearing } from './helpers';

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

  it('worldFromSnapshot throws when custom level JSON is missing', () => {
    const host = makeSim({ seed: 21, settings: { playerCount: 2 } });
    const snap = { ...host.snapshot(), levelId: 'user-not-in-catalog' };
    expect(() => worldFromSnapshot(snap)).toThrow(/requires the host JSON override/);
    const custom = parseLevel({
      id: 'user-not-in-catalog',
      name: 'Override',
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
    const view = createClientView(snap, 120, custom);
    expect(view.sim.ctx.level.id).toBe('user-not-in-catalog');
  });

  it('parses ?net=100,2 loss shaping', () => {
    expect(netShapeFromSearch('?net=100,2')).toEqual({ latencyMs: 100, loss: 0.02 });
    expect(netShapeFromSearch('lag=40&loss=0.05')).toEqual({ latencyMs: 40, loss: 0.05 });
  });

  it('interp apply restores thrown-weapon BodyVel from the to snapshot', () => {
    const host = makeSim({ seed: 203, settings: { playerCount: 2 } });
    const gun = spawnWeapon(host.ecs, 'pistol', 8, 6);
    const first = host.snapshot();
    host.ctx.bodies.get(gun)?.setLinearVelocity({ x: 14, y: 2.5 });
    host.ctx.bodies.get(gun)?.setAngularVelocity(-1.8);
    const flying = host.snapshot();
    const gunNet = gun.get(NetId)!.id;
    expect(Number(flying.entities.find((e) => e.netId === gunNet)?.traits.BodyVel?.vx)).toBeCloseTo(
      14,
      1,
    );

    const view = createClientView(first, 100);
    view.push(0, first);
    view.push(50, flying);
    view.apply(150);
    let vx = 0;
    let omega = 0;
    view.sim.ecs.query(Weapon, NetId).updateEach(([_w, n], e) => {
      if (n.id !== gunNet) return;
      const b = view.sim.ctx.bodies.get(e);
      vx = b?.getLinearVelocity().x ?? 0;
      omega = b?.getAngularVelocity() ?? 0;
    });
    expect(vx).toBeCloseTo(14, 1);
    expect(omega).toBeCloseTo(-1.8, 1);
  });

  it('parry inside the 100–150 ms interp buffer shows the reflected bullet', () => {
    const host = makeSim({ level: woodsClearing, seed: 13, settings: { playerCount: 2 } });
    const a = playerOf(host, 0);
    const b = playerOf(host, 1);
    host.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    host.ctx.bodies.get(b)?.setPosition({ x: 14, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 14, y: 4, angle: 0 });
    const gun = spawnWeapon(host.ecs, 'pistol', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const combat = b.get(Combat);
    if (combat) b.set(Combat, { ...combat, blocking: true, blockStartTick: host.ctx.tick, blockMeter: 1 });
    const first = host.snapshot();
    let reflectAt = -1;
    let reflectSnap = first;
    for (let i = 0; i < 20; i++) {
      const ev = host.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({ block: true, aimX: -1, aimY: 0 }),
        hold({}),
        hold({}),
      ]);
      if (ev.some((e) => e.type === 'block' && e.reflected)) {
        reflectAt = i;
        reflectSnap = host.snapshot();
        break;
      }
    }
    expect(reflectAt).toBeGreaterThanOrEqual(0);
    const rec = reflectSnap.entities.find((e) => e.traits.Projectile);
    expect(rec).toBeTruthy();
    expect(Number(rec?.traits.Projectile?.vx)).toBeLessThan(0);
    expect(Number(rec?.traits.OwnedBy?.ownerNetId)).toBe(b.get(NetId)?.id ?? -1);

    const delayMs = 120;
    const view = createClientView(first, delayMs, woodsClearing);
    view.push(0, first);
    view.push(50, reflectSnap);
    const early = view.apply(80);
    expect(early?.tick).toBe(first.tick);
    view.apply(50 + delayMs);
    let reflected = false;
    let credit = false;
    view.sim.ecs.query(Projectile).updateEach(([pr], e) => {
      if (pr.vx < 0) reflected = true;
      if (e.targetFor(OwnedBy) === playerOf(view.sim, 1)) credit = true;
    });
    expect(reflected).toBe(true);
    expect(credit).toBe(true);
    expect(playerOf(view.sim, 1).get(Health)?.hp ?? 0).toBeGreaterThan(50);
  });

  it('rebuilds the client world when the host rotates levels', () => {
    const host = makeSim({
      level: getLevel('fist-pit'),
      seed: 88,
      settings: {
        playerCount: 0,
        bots: 2,
        rotation: 'ordered',
        firstTo: 0,
        maxHp: 1,
        enabledWeapons: [],
        enabledLevels: ['fist-pit', 'fist-pit-b'],
      },
    });
    speedRounds(host);
    host.ctx.tuning.countdownTicks = 2;
    host.ctx.tuning.slowmoTicks = 1;
    expect(host.ctx.tuning.scoreboardTicks).toBe(90);
    const first = host.snapshot();
    const view = createClientView(first, 100);
    expect(view.sim.ctx.level.id).toBe(first.levelId);
    view.push(0, first);
    let kills = 0;
    let scoreboardSamples = 0;
    for (let i = 0; i < 4000; i++) {
      const ev = host.step();
      if (host.ecs.get(RoundState)?.phase === RoundPhase.Scoreboard) scoreboardSamples += 1;
      const fists = ev.some((e) => e.type === 'shot' && e.weaponId === 'fists');
      const tickKills = ev.filter((e) => e.type === 'kill').length;
      if (tickKills > 0) expect(fists).toBe(true);
      kills += tickKills;
      if (i % 3 === 0) {
        const snap = host.snapshot();
        view.push(i * (1000 / 60), snap);
        view.apply(i * (1000 / 60) + 120);
      }
      if (host.ctx.level.id !== first.levelId) break;
    }
    expect(kills).toBeGreaterThan(0);
    expect(scoreboardSamples).toBeGreaterThanOrEqual(88);
    expect(view.scoreboardTicksSeen).toBeGreaterThanOrEqual(88);
    expect(host.ctx.level.id).not.toBe(first.levelId);
    const snap = host.snapshot();
    expect(snap.levelId).toBe(host.ctx.level.id);
    view.push(4000 * (1000 / 60), snap);
    view.apply(4000 * (1000 / 60) + 120);
    expect(view.sim.ctx.level.id).toBe(host.ctx.level.id);
    expect(view.sim.ctx.level.bounds.w).toBe(host.ctx.level.bounds.w);
  });

  it('host custom-level JSON is decoded and used by createClientView', () => {
    const custom = parseLevel({
      id: 'wire-custom',
      name: 'Wire Custom',
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
    const host = makeSim({ level: custom, seed: 21, settings: { playerCount: 2 } });
    host.ecs.set(RoundState, {
      ...(host.ecs.get(RoundState) ?? {
        phase: 0,
        ticks: 0,
        aliveMask: 0,
        lastKiller: -1,
        seed: 21,
      }),
      phase: RoundPhase.Fighting,
      aliveMask: 3,
    });
    const snap = host.snapshot();
    const wire = decode(encode({ t: 'level', json: JSON.stringify(custom) }));
    expect(wire.t).toBe('level');
    const parsed = parseLevel(JSON.parse(wire.t === 'level' ? wire.json : '{}'));
    expect(parsed.id).toBe('wire-custom');
    const view = createClientView(snap, 120, parsed);
    expect(view.sim.ctx.level.id).toBe('wire-custom');
    expect(view.sim.ctx.level.bounds.w).toBe(36);
    expect(view.sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);
    expect(snap.phase).toBe(RoundPhase.Fighting);
  });

  it('refuses to open a client view from a delta or a custom level without JSON', () => {
    const host = makeSim({ seed: 9, settings: { playerCount: 2 } });
    const full = host.snapshot();
    const delta = { ...host.snapshotDelta(), full: false as const };
    expect(snapshotCanOpenClientView(delta)).toBe(false);
    expect(snapshotCanOpenClientView(full)).toBe(true);
    const custom = { ...full, levelId: 'e2e-flat' };
    expect(snapshotCanOpenClientView(custom)).toBe(false);
    expect(snapshotCanOpenClientView(custom, { ...woodsClearing, id: 'e2e-flat' })).toBe(true);
    expect(snapshotCanOpenClientView({ ...delta, levelId: 'e2e-flat' }, { ...woodsClearing, id: 'e2e-flat' })).toBe(
      false,
    );
  });
});
