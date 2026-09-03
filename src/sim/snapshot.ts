import type { Entity, World } from 'koota';
import { fnv1a, hashToHex, quantize } from '../core/hash';
import { getContext } from './context';
import {
  Aim,
  Combat,
  Controller,
  Dead,
  Health,
  NetId,
  Player,
  PrevTransform,
  Projectile,
  RoundState,
  Transform,
  Weapon,
} from './traits';

export type TraitSnapshot = {
  netId: number;
  traits: Record<string, Record<string, number | boolean | string>>;
};

export type WorldSnapshot = {
  tick: number;
  rng: number;
  nextId: number;
  seed?: number;
  levelId?: string;
  playerCount?: number;
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
  const rs = world.get(RoundState);
  return {
    tick: ctx.tick,
    rng: ctx.rng.getState(),
    nextId: ctx.ids.peek(),
    seed: rs?.seed ?? 0,
    levelId: ctx.level.id,
    playerCount: ctx.settings.playerCount + ctx.settings.bots,
    entities,
  };
}

function applyRecord(world: World, entity: Entity, rec: TraitSnapshot): void {
  const ctx = getContext(world);
  const t = rec.traits.Transform;
  if (t && entity.get(Transform)) {
    const cur = entity.get(Transform)!;
    if (entity.has(PrevTransform)) entity.set(PrevTransform, { x: cur.x, y: cur.y, angle: cur.angle });
    entity.set(Transform, { x: Number(t.x), y: Number(t.y), angle: Number(t.angle) });
    const body = ctx.bodies.get(entity);
    body?.setPosition({ x: Number(t.x), y: Number(t.y) });
    body?.setAngle(Number(t.angle));
  }
  const h = rec.traits.Health;
  if (h && entity.get(Health)) entity.set(Health, { hp: Number(h.hp), maxHp: Number(h.maxHp) });
  const c = rec.traits.Controller;
  const curC = entity.get(Controller);
  if (c && curC) {
    entity.set(Controller, {
      ...curC,
      grounded: Boolean(c.grounded),
      facing: Number(c.facing),
      vx: Number(c.vx ?? curC.vx),
      vy: Number(c.vy ?? curC.vy),
    });
  }
  const a = rec.traits.Aim;
  const curA = entity.get(Aim);
  if (a && curA) entity.set(Aim, { ...curA, x: Number(a.x), y: Number(a.y) });
  const cb = rec.traits.Combat;
  const curCb = entity.get(Combat);
  if (cb && curCb) {
    entity.set(Combat, {
      ...curCb,
      blockMeter: Number(cb.blockMeter ?? curCb.blockMeter),
      blocking: Boolean(cb.blocking),
      punchActive: Number(cb.punchActive ?? curCb.punchActive),
    });
  }
  const w = rec.traits.Weapon;
  const curW = entity.get(Weapon);
  if (w && curW) {
    entity.set(Weapon, {
      ...curW,
      defId: Number(w.defId ?? curW.defId),
      ammo: Number(w.ammo ?? curW.ammo),
      thrown: Boolean(w.thrown),
    });
  }
  const pr = rec.traits.Projectile;
  const curPr = entity.get(Projectile);
  if (pr && curPr) {
    entity.set(Projectile, {
      ...curPr,
      x: Number(pr.x),
      y: Number(pr.y),
      vx: Number(pr.vx),
      vy: Number(pr.vy),
      kind: Number(pr.kind ?? curPr.kind),
    });
  }
  if (h) {
    if (Number(h.hp) <= 0) {
      if (!entity.has(Dead)) entity.add(Dead());
    } else if (entity.has(Dead)) {
      entity.remove(Dead);
    }
  }
}

export function restoreWorld(world: World, snap: WorldSnapshot): void {
  const ctx = getContext(world);
  ctx.rng.setState(snap.rng);
  ctx.ids.setNext(snap.nextId);
  ctx.tick = snap.tick;
  const byNet = new Map<number, TraitSnapshot>();
  for (const e of snap.entities) byNet.set(e.netId, e);
  const used = new Set<number>();
  world.query(NetId).updateEach(([net], entity) => {
    const rec = byNet.get(net.id);
    if (!rec) return;
    used.add(net.id);
    applyRecord(world, entity, rec);
  });
  world.query(Player, NetId).updateEach(([p, net], entity) => {
    if (used.has(net.id)) return;
    const rec = snap.entities.find((e) => Number(e.traits.Player?.slot) === p.slot);
    if (!rec) return;
    applyRecord(world, entity, rec);
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
