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
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Dead, Health, Held, HeldBy, Loose, NetId, RagdollPart, Weapon } from '../src/sim/traits';
import { hold, makeSim, playerOf, pos } from './helpers';

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

    const client = makeSim({ seed: 93, settings: { playerCount: 2 } });
    let before = 0;
    client.ecs.query(RagdollPart).updateEach(() => {
      before += 1;
    });
    restoreWorld(client.ecs, snap);
    let after = 0;
    client.ecs.query(RagdollPart).updateEach(() => {
      after += 1;
    });
    expect(before).toBe(0);
    expect(after).toBe(parts.length);
  });
});
