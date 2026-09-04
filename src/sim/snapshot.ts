import type { World } from 'koota';
import { fnv1a, hashToHex, quantize } from '../core/hash';
import { getContext } from './context';
import { Aim, Combat, Controller, Health, NetId, Player, Projectile, Transform, Weapon } from './traits';

export type TraitSnapshot = {
  netId: number;
  traits: Record<string, Record<string, number | boolean | string>>;
};

export type WorldSnapshot = {
  tick: number;
  rng: number;
  nextId: number;
  entities: TraitSnapshot[];
};

export function serializeWorld(world: World): WorldSnapshot {
  const ctx = getContext(world);
  const entities: TraitSnapshot[] = [];
  world.query(NetId).updateEach(([net], entity) => {
    const snap: TraitSnapshot = { netId: net.id, traits: {} };
    const t = entity.get(Transform);
    if (t) snap.traits.Transform = { x: t.x, y: t.y, angle: t.angle };
    const h = entity.get(Health);
    if (h) snap.traits.Health = { hp: h.hp, maxHp: h.maxHp };
    const p = entity.get(Player);
    if (p) snap.traits.Player = { slot: p.slot, color: p.color, inputIndex: p.inputIndex };
    const c = entity.get(Controller);
    if (c) snap.traits.Controller = { grounded: c.grounded, facing: c.facing, vx: c.vx, vy: c.vy };
    const a = entity.get(Aim);
    if (a) snap.traits.Aim = { x: a.x, y: a.y };
    const w = entity.get(Weapon);
    if (w) snap.traits.Weapon = { defId: w.defId, ammo: w.ammo, thrown: w.thrown };
    const pr = entity.get(Projectile);
    if (pr) snap.traits.Projectile = { x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, kind: pr.kind };
    const cb = entity.get(Combat);
    if (cb) snap.traits.Combat = { blockMeter: cb.blockMeter, blocking: cb.blocking };
    entities.push(snap);
  });
  entities.sort((a, b) => a.netId - b.netId);
  return { tick: ctx.tick, rng: ctx.rng.getState(), nextId: ctx.ids.peek(), entities };
}

export function restoreWorld(world: World, snap: WorldSnapshot): void {
  const ctx = getContext(world);
  ctx.rng.setState(snap.rng);
  ctx.ids.setNext(snap.nextId);
  ctx.tick = snap.tick;
  const byNet = new Map<number, (typeof snap.entities)[0]>();
  for (const e of snap.entities) byNet.set(e.netId, e);
  world.query(NetId).updateEach(([net], entity) => {
    const rec = byNet.get(net.id);
    if (!rec) return;
    const t = rec.traits.Transform;
    if (t && entity.get(Transform)) {
      entity.set(Transform, { x: Number(t.x), y: Number(t.y), angle: Number(t.angle) });
      const body = ctx.bodies.get(entity);
      body?.setPosition({ x: Number(t.x), y: Number(t.y) });
      body?.setAngle(Number(t.angle));
    }
    const h = rec.traits.Health;
    if (h && entity.get(Health)) entity.set(Health, { hp: Number(h.hp), maxHp: Number(h.maxHp) });
  });
}

export function hashWorld(world: World): string {
  const snap = serializeWorld(world);
  const nums: number[] = [snap.tick, snap.rng, snap.nextId];
  for (const e of snap.entities) {
    nums.push(e.netId);
    for (const key of Object.keys(e.traits).sort()) {
      const rec = e.traits[key]!;
      for (const field of Object.keys(rec).sort()) {
        const v = rec[field];
        if (typeof v === 'number') nums.push(quantize(v));
        else if (typeof v === 'boolean') nums.push(v ? 1 : 0);
      }
    }
  }
  return hashToHex(fnv1a(nums));
}
