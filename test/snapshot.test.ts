import { describe, expect, it } from 'vitest';
import type { World as PhysicsWorld } from 'planck';
import { createClientView } from '../src/net/clientView';
import { getLevel } from '../src/levels/catalog';
import {
  drainChangeTrackers,
  hashWorld,
  mergeSnapshot,
  restoreWorld,
  serializeDelta,
  serializeWorld,
} from '../src/sim/snapshot';
import { spawnWeapon } from '../src/sim/systems/weapons';
import {
  Boss,
  Combat,
  Controller,
  Crown,
  Dead,
  Destructible,
  DropState,
  Hazard,
  HazardKind,
  HazardPath,
  Health,
  Held,
  HeldBy,
  Kinematic,
  Loose,
  MatchState,
  NetId,
  OwnedBy,
  PartOf,
  RagdollPart,
  Solid,
  Static,
  Status,
  Weapon,
} from '../src/sim/traits';
import { hold, makeSim, playerOf, pos } from './helpers';

function countJoints(physics: PhysicsWorld): number {
  let n = 0;
  for (let j = physics.getJointList(); j; j = j.getNext()) n += 1;
  return n;
}

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

  it('serializes Held + holder and late-join spawns a weapon the client never had', () => {
    const host = makeSim({ seed: 90, settings: { playerCount: 2 } });
    const p = playerOf(host, 0);
    const gun = spawnWeapon(host.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    host.step([hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    const gunNet = gun.get(NetId)!.id;
    const snap = serializeWorld(host.ecs);
    const rec = snap.entities.find((e) => e.netId === gunNet);
    expect(rec?.traits.Weapon?.held).toBe(1);
    expect(Number(rec?.traits.Weapon?.holderNetId)).toBeGreaterThanOrEqual(0);

    const client = makeSim({ seed: 91, settings: { playerCount: 2 } });
    let before = 0;
    client.ecs.query(Weapon).updateEach(() => {
      before += 1;
    });
    restoreWorld(client.ecs, snap);
    let found = false;
    let held = false;
    let holderOk = false;
    client.ecs.query(Weapon, NetId).updateEach(([_w, n], e) => {
      if (n.id !== gunNet) return;
      found = true;
      held = e.has(Held);
      holderOk = e.targetFor(HeldBy) === playerOf(client, 0);
    });
    expect(before).toBe(0);
    expect(found).toBe(true);
    expect(held).toBe(true);
    expect(holderOk).toBe(true);
    let bodyActive = true;
    client.ecs.query(Weapon, NetId).updateEach(([_w, n], e) => {
      if (n.id === gunNet) bodyActive = client.ctx.bodies.get(e)?.isActive() ?? true;
    });
    expect(bodyActive).toBe(false);
  });

  it('late-join snapshot respawns ragdoll parts from a host death', () => {
    const host = makeSim({ seed: 92, settings: { playerCount: 2 } });
    const victim = playerOf(host, 1);
    victim.set(Health, { hp: 0, maxHp: 100 });
    host.step([hold({}), hold({}), hold({}), hold({})]);
    expect(victim.has(Dead)).toBe(true);
    const snap = serializeWorld(host.ecs);
    const parts = snap.entities.filter((e) => e.traits.RagdollPart);
    expect(parts.length).toBeGreaterThanOrEqual(8);
    expect(parts.every((p) => Number(p.traits.RagdollPart?.rootNetId) >= 0)).toBe(true);
    expect(snap.entities.some((e) => e.traits.RagdollRoot)).toBe(true);

    const client = makeSim({ seed: 93, settings: { playerCount: 2 } });
    let before = 0;
    client.ecs.query(RagdollPart).updateEach(() => {
      before += 1;
    });
    const jointsBefore = countJoints(client.ctx.physics);
    restoreWorld(client.ecs, snap);
    let after = 0;
    let linked = 0;
    let active = 0;
    client.ecs.query(RagdollPart).updateEach((_, e) => {
      after += 1;
      if (e.targetFor(PartOf)) linked += 1;
      if (client.ctx.bodies.get(e)?.isActive()) active += 1;
    });
    expect(before).toBe(0);
    expect(after).toBe(parts.length);
    expect(linked).toBe(parts.length);
    expect(active).toBe(parts.length);
    const jointsAfter = countJoints(client.ctx.physics);
    expect(jointsAfter - jointsBefore).toBeGreaterThanOrEqual(9);
    restoreWorld(client.ecs, snap);
    expect(countJoints(client.ctx.physics)).toBe(jointsAfter);
  });

  it('late-join snapshot includes Status, OwnedBy, and mid-round debris', () => {
    const debrisLevel = getLevel('test-block.destructible');
    const host = makeSim({
      level: debrisLevel,
      seed: 94,
      settings: { playerCount: 2 },
    });
    const a = playerOf(host, 0);
    host.ecs.query(Destructible, Hazard).updateEach(([d, hz]) => {
      if (hz.kind === HazardKind.Destructible) d.hp = 0;
    });
    host.step([hold({}), hold({}), hold({}), hold({})]);
    a.set(Status, { burning: 40, slowed: 0, glued: 90, bubbled: 12 });
    const snap = serializeWorld(host.ecs);
    const aRec = snap.entities.find((e) => Number(e.traits.Player?.slot) === 0);
    expect(aRec?.traits.Status).toMatchObject({ burning: 40, glued: 90, bubbled: 12 });
    const debris = snap.entities.filter((e) => Number(e.traits.Hazard?.kind) === HazardKind.Debris);
    expect(debris.length).toBeGreaterThanOrEqual(4);
    expect(debris.every((e) => e.traits.Lifetime)).toBe(true);

    const view = createClientView(snap, 120, debrisLevel);
    expect(playerOf(view.sim, 0).get(Status)).toMatchObject({
      burning: 40,
      glued: 90,
      bubbled: 12,
    });
    let clientDebris = 0;
    let destLeft = 0;
    view.sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Debris) clientDebris += 1;
    });
    view.sim.ecs.query(Destructible).updateEach(() => {
      destLeft += 1;
    });
    expect(clientDebris).toBe(debris.length);
    expect(destLeft).toBe(0);
  });

  it('serializes OwnedBy so kill credit survives restore', () => {
    const host = makeSim({ seed: 95, settings: { playerCount: 2 } });
    const a = playerOf(host, 0);
    const gun = spawnWeapon(host.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    gun.add(OwnedBy(a));
    const snap = serializeWorld(host.ecs);
    const rec = snap.entities.find((e) => e.netId === gun.get(NetId)!.id);
    expect(Number(rec?.traits.OwnedBy?.ownerNetId)).toBe(a.get(NetId)!.id);

    const client = makeSim({ seed: 96, settings: { playerCount: 2 } });
    restoreWorld(client.ecs, snap);
    let ownerOk = false;
    client.ecs.query(Weapon, NetId).updateEach(([_w, n], e) => {
      if (n.id !== gun.get(NetId)!.id) return;
      ownerOk = e.targetFor(OwnedBy) === playerOf(client, 0);
    });
    expect(ownerOk).toBe(true);
  });

  it('late-join snapshot restores Crown from match wins and Boss hp', () => {
    const host = makeSim({
      level: getLevel('halloween-boss'),
      seed: 97,
      settings: { playerCount: 2 },
    });
    const ms = host.ecs.get(MatchState)!;
    host.ecs.set(MatchState, { ...ms, wins0: 3, wins1: 1, wins2: 0, wins3: 0 });
    host.ecs.query(Boss).updateEach(([b]) => {
      b.hp = 77;
    });
    const snap = serializeWorld(host.ecs);
    expect(snap.wins?.[0]).toBe(3);
    expect(snap.entities.some((e) => Number(e.traits.Boss?.hp) === 77)).toBe(true);

    const view = createClientView(snap, 120, getLevel('halloween-boss'));
    expect(playerOf(view.sim, 0).has(Crown)).toBe(true);
    expect(playerOf(view.sim, 1).has(Crown)).toBe(false);
    let bossHp = 0;
    view.sim.ecs.query(Boss).updateEach(([b]) => {
      bossHp = b.hp;
    });
    expect(bossHp).toBe(77);
  });

  it('serializes HazardPath, tags, DropState, and Combat.blockStartTick', () => {
    const host = makeSim({
      level: getLevel('test-platform.moving'),
      seed: 98,
      settings: { playerCount: 2 },
    });
    for (let i = 0; i < 40; i++) host.step([hold({}), hold({}), hold({}), hold({})]);
    const a = playerOf(host, 0);
    const combat = a.get(Combat)!;
    a.set(Combat, { ...combat, blocking: true, blockStartTick: 42, blockMeter: 1 });
    const ctrl = a.get(Controller)!;
    a.set(Controller, { ...ctrl, ducking: true, wallSliding: true, wallDir: -1 });
    host.ecs.set(DropState, { nextDrop: 333, looseCount: 2 });
    const snap = serializeWorld(host.ecs);
    expect(snap.nextDrop).toBe(333);
    expect(snap.looseCount).toBe(2);
    const aRec = snap.entities.find((e) => Number(e.traits.Player?.slot) === 0);
    expect(aRec?.traits.Combat?.blockStartTick).toBe(42);
    expect(aRec?.traits.Controller?.ducking).toBe(1);
    expect(aRec?.traits.Controller?.wallSliding).toBe(1);
    expect(snap.entities.some((e) => e.traits.HazardPath && Number(e.traits.HazardPath.index) >= 0)).toBe(
      true,
    );
    expect(snap.entities.some((e) => e.traits.Static && e.traits.Solid)).toBe(true);
    expect(snap.entities.some((e) => e.traits.Kinematic && e.traits.HazardPath)).toBe(true);

    const view = createClientView(snap, 120, getLevel('test-platform.moving'));
    expect(playerOf(view.sim, 0).get(Combat)?.blockStartTick).toBe(42);
    expect(playerOf(view.sim, 0).get(Controller)?.ducking).toBe(true);
    expect(view.sim.ecs.get(DropState)?.nextDrop).toBe(333);
    let pathOk = false;
    view.sim.ecs.query(HazardPath, Kinematic).updateEach(([path]) => {
      if (path.points.length >= 2) pathOk = true;
    });
    expect(pathOk).toBe(true);
  });

  it('deltas include Status and OwnedBy changes without Transform motion', () => {
    const host = makeSim({ seed: 99, settings: { playerCount: 2 } });
    serializeWorld(host.ecs);
    drainChangeTrackers(host.ecs);
    const a = playerOf(host, 0);
    const idle = serializeDelta(host.ecs);
    drainChangeTrackers(host.ecs);
    a.set(Status, { burning: 40, slowed: 0, glued: 90, bubbled: 0 });
    const statusDelta = serializeDelta(host.ecs);
    expect(statusDelta.full).toBe(false);
    const statusRec = statusDelta.entities.find((e) => Number(e.traits.Status?.glued) === 90);
    expect(statusRec).toBeTruthy();
    expect(statusDelta.entities.length).toBeLessThanOrEqual(idle.entities.length + 4);

    drainChangeTrackers(host.ecs);
    const gun = spawnWeapon(host.ecs, 'pistol', 8, 6);
    gun.add(OwnedBy(a));
    const creditDelta = serializeDelta(host.ecs);
    const gunRec = creditDelta.entities.find((e) => e.netId === gun.get(NetId)!.id);
    expect(Number(gunRec?.traits.OwnedBy?.ownerNetId)).toBe(a.get(NetId)!.id);
  });
});
