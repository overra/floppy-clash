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
import { spawnSnake } from '../src/sim/weapons/projectiles';
import {
  Aim,
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
  Projectile,
  ProjectileKind,
  RagdollPart,
  Snake,
  Status,
  Weapon,
  replication,
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

  it('restores player body velocity from Controller (PLAN 4.13)', () => {
    const host = makeSim({ seed: 107, settings: { playerCount: 2 } });
    const a = playerOf(host, 0);
    host.ctx.bodies.get(a)?.setLinearVelocity({ x: 7.5, y: 3.2 });
    const ctrl = a.get(Controller)!;
    a.set(Controller, { ...ctrl, vx: 7.5, vy: 3.2 });
    const snap = serializeWorld(host.ecs);
    const view = createClientView(snap);
    const v = view.sim.ctx.bodies.get(playerOf(view.sim, 0))?.getLinearVelocity();
    expect(v?.x).toBeCloseTo(7.5, 1);
    expect(v?.y).toBeCloseTo(3.2, 1);
  });

  it('deltas include Controller-only ducking without Transform motion', () => {
    const host = makeSim({ seed: 108, settings: { playerCount: 2 } });
    serializeWorld(host.ecs);
    drainChangeTrackers(host.ecs);
    const a = playerOf(host, 0);
    const ctrl = a.get(Controller)!;
    a.set(Controller, { ...ctrl, ducking: true, vx: 2, vy: -1 });
    const delta = serializeDelta(host.ecs);
    const rec = delta.entities.find((e) => Number(e.traits.Player?.slot) === 0);
    expect(rec?.traits.Controller?.ducking).toBe(1);
    expect(rec?.traits.Controller?.vx).toBe(2);
  });

  it('late-join spawns a body for grenade projectiles and copies velocity', () => {
    const host = makeSim({ seed: 109, settings: { playerCount: 2 } });
    const a = playerOf(host, 0);
    const gun = spawnWeapon(host.ecs, 'grenade-launcher', 8, 6);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    host.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    const hostVel = { x: 0, y: 0, found: false };
    host.ecs.query(Projectile).updateEach(([p], e) => {
      const v = host.ctx.bodies.get(e)?.getLinearVelocity();
      if (v) {
        hostVel.x = v.x;
        hostVel.y = v.y;
        hostVel.found = true;
      }
      expect(p.kind).toBe(ProjectileKind.Grenade);
    });
    expect(hostVel.found).toBe(true);
    const snap = serializeWorld(host.ecs);
    expect(snap.entities.some((e) => e.traits.Projectile && e.traits.Transform)).toBe(true);
    const view = createClientView(snap);
    let bodies = 0;
    let vx = 0;
    view.sim.ecs.query(Projectile).updateEach((_, e) => {
      const body = view.sim.ctx.bodies.get(e);
      if (body) {
        bodies += 1;
        vx = body.getLinearVelocity().x;
      }
    });
    expect(bodies).toBeGreaterThan(0);
    expect(Math.abs(vx)).toBeGreaterThan(2);
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

  it('serializes Aim.holdTicks, Weapon.pickupCooldown, and projectile extras', () => {
    const host = makeSim({ seed: 101, settings: { playerCount: 2 } });
    const a = playerOf(host, 0);
    const aim = a.get(Aim)!;
    a.set(Aim, { ...aim, holdTicks: 17 });
    const gun = spawnWeapon(host.ecs, 'pistol', 8, 6);
    gun.set(Weapon, { ...gun.get(Weapon)!, pickupCooldown: 22, thrownHit: true, thrown: true });
    const bullet = host.ecs.spawn(
      Projectile({
        kind: 0,
        damage: 12,
        speed: 40,
        bounces: 3,
        fuse: 0,
        x: 5,
        y: 6,
        vx: 8,
        vy: -1,
        gravity: 0.4,
        ownerGrace: 6,
        defId: 1,
      }),
      NetId({ id: 9001 }),
    );
    void bullet;
    spawnSnake(host.ecs, 9, 5, a, false, false);
    host.ecs.query(Snake).updateEach(([s]) => {
      s.biteCooldown = 11;
    });
    const snap = serializeWorld(host.ecs);
    const aRec = snap.entities.find((e) => Number(e.traits.Player?.slot) === 0);
    expect(aRec?.traits.Aim?.holdTicks).toBe(17);
    const gunRec = snap.entities.find((e) => e.netId === gun.get(NetId)!.id);
    expect(gunRec?.traits.Weapon?.pickupCooldown).toBe(22);
    expect(gunRec?.traits.Weapon?.thrownHit).toBe(1);
    const pr = snap.entities.find((e) => e.traits.Projectile && Number(e.traits.Projectile.bounces) === 3);
    expect(pr?.traits.Projectile).toMatchObject({ gravity: 0.4, ownerGrace: 6, bounces: 3 });
    expect(snap.entities.some((e) => Number(e.traits.Snake?.biteCooldown) === 11)).toBe(true);

    const view = createClientView(snap);
    expect(playerOf(view.sim, 0).get(Aim)?.holdTicks).toBe(17);
    let cd = -1;
    let bounced = false;
    let bite = -1;
    view.sim.ecs.query(Weapon, NetId).updateEach(([w, n]) => {
      if (n.id === gun.get(NetId)!.id) cd = w.pickupCooldown;
    });
    view.sim.ecs.query(Projectile).updateEach(([p]) => {
      if (p.bounces === 3 && p.gravity === 0.4 && p.ownerGrace === 6) bounced = true;
    });
    view.sim.ecs.query(Snake).updateEach(([s]) => {
      bite = s.biteCooldown;
    });
    expect(cd).toBe(22);
    expect(bounced).toBe(true);
    expect(bite).toBe(11);
  });

  it('deltas include Health-only and Destructible-only changes', () => {
    const host = makeSim({
      level: getLevel('test-block.destructible'),
      seed: 102,
      settings: { playerCount: 2 },
    });
    serializeWorld(host.ecs);
    drainChangeTrackers(host.ecs);
    const a = playerOf(host, 0);
    a.set(Health, { hp: 61, maxHp: 100 });
    const hpDelta = serializeDelta(host.ecs);
    expect(hpDelta.entities.some((e) => Number(e.traits.Health?.hp) === 61)).toBe(true);
    drainChangeTrackers(host.ecs);
    host.ecs.query(Destructible, Hazard).updateEach(([d, hz]) => {
      if (hz.kind === HazardKind.Destructible) d.hp = 41;
    });
    host.ecs.query(Destructible).updateEach(([d], e) => {
      e.set(Destructible, { hp: d.hp, maxHp: d.maxHp });
    });
    const destDelta = serializeDelta(host.ecs);
    expect(destDelta.entities.some((e) => Number(e.traits.Destructible?.hp) === 41)).toBe(true);
  });

  it('full snapshots cover every replicated trait class', () => {
    const seen = new Set<string>();
    const absorb = (snap: ReturnType<typeof serializeWorld>) => {
      seen.add('NetId');
      if (snap.phase != null) seen.add('RoundState');
      if (snap.wins) seen.add('MatchState');
      if (snap.stepScale != null) seen.add('SimClock');
      if (snap.nextDrop != null) seen.add('DropState');
      for (const e of snap.entities) {
        for (const key of Object.keys(e.traits)) {
          if (key === 'RagdollRoot') seen.add('Player');
          else if (key === 'OwnedBy') continue;
          else seen.add(key);
        }
      }
    };
    const gym = makeSim({ seed: 103, settings: { playerCount: 2 } });
    const p = playerOf(gym, 1);
    spawnWeapon(gym.ecs, 'pistol', 7, 6);
    const gun = spawnWeapon(gym.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(playerOf(gym, 0)));
    gun.remove(Loose);
    p.set(Health, { hp: 0, maxHp: 100 });
    gym.step([hold({}), hold({}), hold({}), hold({})]);
    const ms = gym.ecs.get(MatchState)!;
    gym.ecs.set(MatchState, { ...ms, wins0: 2, firstTo: 5, maxHp: 80 });
    playerOf(gym, 0).add(Crown());
    absorb(serializeWorld(gym.ecs));
    absorb(
      serializeWorld(
        makeSim({
          level: getLevel('test-platform.moving'),
          seed: 104,
          settings: { playerCount: 2 },
        }).ecs,
      ),
    );
    absorb(
      serializeWorld(
        makeSim({
          level: getLevel('halloween-boss'),
          seed: 105,
          settings: { playerCount: 2 },
        }).ecs,
      ),
    );
    const dest = makeSim({
      level: getLevel('test-block.destructible'),
      seed: 106,
      settings: { playerCount: 2 },
    });
    dest.ecs.query(Destructible, Hazard).updateEach(([d, hz]) => {
      if (hz.kind === HazardKind.Destructible) d.hp = 0;
    });
    dest.step([hold({}), hold({}), hold({}), hold({})]);
    spawnSnake(dest.ecs, 6, 5, playerOf(dest, 0), false, false);
    dest.ecs.spawn(
      Projectile({
        kind: 0,
        damage: 1,
        speed: 1,
        bounces: 0,
        fuse: 0,
        x: 1,
        y: 1,
        vx: 1,
        vy: 0,
        gravity: 0,
        ownerGrace: 0,
        defId: 0,
      }),
      NetId({ id: 8001 }),
    );
    absorb(serializeWorld(dest.ecs));
    const missing = Object.entries(replication)
      .filter(([, kind]) => kind === 'replicated')
      .map(([name]) => name)
      .filter((name) => !seen.has(name));
    expect(missing, `unreplicated: ${missing.join(', ')}`).toEqual([]);
  });
});
