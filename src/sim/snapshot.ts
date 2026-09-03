import { createAdded, createChanged, createRemoved, type Entity, type World } from 'koota';
import { fnv1a, hashToHex, quantize } from '../core/hash';
import { isolateChainBody } from './hazards/chain';
import { applyBodyShapeToSpec, createLateJoinHazardBody, lateJoinBodySpec } from './hazards/lateJoin';
import { attachLateJoinHazardJoints } from './hazards/lateJoinJoints';
import { createBoxBody, createCircleBody, destroyBody, readBodyShape, registerBody } from './physics/bodies';
import { getContext } from './context';
import { spawnPlayer } from './level/loader';
import { attachRagdollJoints, isRagdollRoot, ragdollPartSpec, RAGDOLL_JOINTS } from './player/ragdoll';
import { assignCrownToLeader } from './rules/rounds';
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
  Lifetime,
  Loose,
  MatchState,
  NetId,
  OwnedBy,
  PartOf,
  Player,
  PrevTransform,
  Projectile,
  ProjectileKind,
  RagdollPart,
  RoundState,
  SimClock,
  Snake,
  Solid,
  Static,
  Status,
  Transform,
  Weapon,
} from './traits';

/** PLAN 4.13: one tracker instance so Changed/Added/Removed persist across snapshot calls. */
const Changed = createChanged();
const Added = createAdded();
const Removed = createRemoved();

/** Joints are rebuilt once per root NetId; restoreWorld runs every interpolating frame. */
const ragdollJointsBuilt = new WeakMap<World, Set<number>>();
/** Last `OwnedBy` owner NetId per entity, so deltas can include credit/re-own without motion. */
const lastOwnedBy = new WeakMap<World, Map<number, number>>();

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
  /** PLAN 4.13: `RoundState` / `MatchState` are replicated world traits. */
  phase?: number;
  roundTicks?: number;
  aliveMask?: number;
  lastKiller?: number;
  wins?: number[];
  matchRound?: number;
  firstTo?: number;
  levelIndex?: number;
  rotation?: number;
  showWins?: number;
  maxHp?: number;
  nextDrop?: number;
  looseCount?: number;
  stepScale?: number;
  entities: TraitSnapshot[];
  /** false = Changed(Transform) + Added/Removed NetId (PLAN 4.13). Late join uses full. */
  full?: boolean;
  added?: number[];
  removed?: number[];
};

function snapshotOwnedBy(world: World): Map<number, number> {
  const map = new Map<number, number>();
  world.query(NetId).updateEach(([net], entity) => {
    const owner = entity.targetFor(OwnedBy);
    if (owner) map.set(net.id, owner.get(NetId)?.id ?? -1);
  });
  return map;
}

function refreshOwnedByCache(world: World): void {
  lastOwnedBy.set(world, snapshotOwnedBy(world));
}

function ownedByChangedIds(world: World): number[] {
  const prev = lastOwnedBy.get(world) ?? new Map<number, number>();
  const next = snapshotOwnedBy(world);
  const changed: number[] = [];
  for (const [id, oid] of next) {
    if (prev.get(id) !== oid) changed.push(id);
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) changed.push(id);
  }
  lastOwnedBy.set(world, next);
  return changed;
}

export function serializeWorld(world: World, opts?: { skipOwnedByCache?: boolean }): WorldSnapshot {
  const ctx = getContext(world);
  const entities: TraitSnapshot[] = [];
  world.query(NetId).updateEach(([net], entity) => {
    const snap: TraitSnapshot = { netId: net.id, traits: {} };
    const t = entity.get(Transform);
    if (t) snap.traits.Transform = { x: t.x, y: t.y, angle: t.angle };
    const bv = readBodyVel(world, entity);
    if (bv) snap.traits.BodyVel = bv;
    const h = entity.get(Health);
    if (h) snap.traits.Health = { hp: h.hp, maxHp: h.maxHp };
    const p = entity.get(Player);
    if (p) {
      if (isRagdollRoot(entity)) {
        snap.traits.RagdollRoot = { slot: p.slot, color: p.color, inputIndex: p.inputIndex };
      } else {
        snap.traits.Player = { slot: p.slot, color: p.color, inputIndex: p.inputIndex };
      }
    }
    const c = entity.get(Controller);
    if (c) {
      snap.traits.Controller = {
        grounded: c.grounded,
        facing: c.facing,
        vx: c.vx,
        vy: c.vy,
        ducking: c.ducking ? 1 : 0,
        wallSliding: c.wallSliding ? 1 : 0,
        wallDir: c.wallDir,
        coyote: c.coyote,
        jumpBuffer: c.jumpBuffer,
        lockTicks: c.lockTicks,
      };
    }
    const a = entity.get(Aim);
    if (a) snap.traits.Aim = { x: a.x, y: a.y, holdTicks: a.holdTicks };
    const w = entity.get(Weapon);
    if (w) {
      const holder = entity.has(Held) ? entity.targetFor(HeldBy) : undefined;
      snap.traits.Weapon = {
        defId: w.defId,
        ammo: w.ammo,
        thrown: w.thrown,
        thrownHit: w.thrownHit ? 1 : 0,
        pickupCooldown: w.pickupCooldown,
        held: entity.has(Held) ? 1 : 0,
        loose: entity.has(Loose) ? 1 : 0,
        holderNetId: holder?.get(NetId)?.id ?? -1,
      };
    }
    const pr = entity.get(Projectile);
    if (pr) {
      snap.traits.Projectile = {
        x: pr.x,
        y: pr.y,
        vx: pr.vx,
        vy: pr.vy,
        kind: pr.kind,
        damage: pr.damage,
        fuse: pr.fuse,
        defId: pr.defId,
        speed: pr.speed,
        bounces: pr.bounces,
        gravity: pr.gravity,
        ownerGrace: pr.ownerGrace,
      };
    }
    const sn = entity.get(Snake);
    if (sn) snap.traits.Snake = { hp: sn.hp, giant: sn.giant, flying: sn.flying, biteCooldown: sn.biteCooldown };
    const rp = entity.get(RagdollPart);
    if (rp) {
      const root = entity.targetFor(PartOf);
      snap.traits.RagdollPart = { part: rp.part, rootNetId: root?.get(NetId)?.id ?? -1 };
    }
    const cb = entity.get(Combat);
    if (cb) {
      snap.traits.Combat = {
        blockMeter: cb.blockMeter,
        blocking: cb.blocking,
        blockStartTick: cb.blockStartTick,
        punchActive: cb.punchActive,
        punchCooldown: cb.punchCooldown,
        refillDelay: cb.refillDelay,
      };
    }
    const st = entity.get(Status);
    if (st) {
      snap.traits.Status = {
        burning: st.burning,
        slowed: st.slowed,
        glued: st.glued,
        bubbled: st.bubbled,
      };
    }
    const owner = entity.targetFor(OwnedBy);
    if (owner) snap.traits.OwnedBy = { ownerNetId: owner.get(NetId)?.id ?? -1 };
    const hz = entity.get(Hazard);
    if (hz) {
      snap.traits.Hazard = {
        kind: hz.kind,
        param0: hz.param0,
        param1: hz.param1,
        param2: hz.param2,
        param3: hz.param3,
        hp: hz.hp,
        armed: hz.armed,
      };
      const life = entity.get(Lifetime);
      if (life) snap.traits.Lifetime = { ticksLeft: life.ticksLeft };
    }
    const dest = entity.get(Destructible);
    if (dest) snap.traits.Destructible = { hp: dest.hp, maxHp: dest.maxHp };
    const boss = entity.get(Boss);
    if (boss) snap.traits.Boss = { hp: boss.hp, bite: boss.bite, speed: boss.speed };
    if (entity.has(Crown)) snap.traits.Crown = { on: 1 };
    if (entity.has(Dead)) snap.traits.Dead = { on: 1 };
    if (entity.has(Static)) snap.traits.Static = { on: 1 };
    if (entity.has(Kinematic)) snap.traits.Kinematic = { on: 1 };
    if (entity.has(Solid)) snap.traits.Solid = { on: 1 };
    if (entity.has(Loose)) snap.traits.Loose = { on: 1 };
    if (entity.has(Held)) snap.traits.Held = { on: 1 };
    const path = entity.get(HazardPath);
    if (path) {
      snap.traits.HazardPath = {
        index: path.index,
        accum: path.accum,
        mode: path.mode,
        dir: path.dir,
        speed: path.speed,
        points: path.points.map((p) => `${p.x},${p.y}`).join(';'),
      };
    }
    const body = ctx.bodies.get(entity);
    if (body) {
      const shape = readBodyShape(body);
      if (shape) snap.traits.BodyShape = shape;
    }
    entities.push(snap);
  });
  entities.sort((a, b) => a.netId - b.netId);
  const rs = world.get(RoundState);
  const ms = world.get(MatchState);
  const drop = world.get(DropState);
  const clock = world.get(SimClock);
  if (!opts?.skipOwnedByCache) refreshOwnedByCache(world);
  return {
    tick: ctx.tick,
    rng: ctx.rng.getState(),
    nextId: ctx.ids.peek(),
    seed: rs?.seed ?? 0,
    levelId: ctx.level.id,
    playerCount: ctx.settings.playerCount + ctx.settings.bots,
    phase: rs?.phase,
    roundTicks: rs?.ticks,
    aliveMask: rs?.aliveMask,
    lastKiller: rs?.lastKiller,
    wins: ms ? [ms.wins0, ms.wins1, ms.wins2, ms.wins3] : undefined,
    matchRound: ms?.round,
    firstTo: ms?.firstTo,
    levelIndex: ms?.levelIndex,
    rotation: ms?.rotation,
    showWins: ms?.showWins,
    maxHp: ms?.maxHp,
    nextDrop: drop?.nextDrop,
    looseCount: drop?.looseCount,
    stepScale: clock?.stepScale,
    entities,
    full: true,
  };
}

/** Consume change trackers after a full snapshot so the next delta is incremental. */
const DELTA_TRAITS = [
  Transform,
  Controller,
  Status,
  Combat,
  HazardPath,
  Health,
  Destructible,
  Weapon,
  Hazard,
  Boss,
  Snake,
  Aim,
  Lifetime,
] as const;

export function drainChangeTrackers(world: World): void {
  for (const trait of DELTA_TRAITS) {
    world.query(Changed(trait)).forEach(() => undefined);
  }
  world.query(Added(NetId)).forEach(() => undefined);
  world.query(Removed(NetId)).forEach(() => undefined);
  refreshOwnedByCache(world);
}

/**
 * Delta snapshot: Changed on replicated value traits + `OwnedBy` diffs
 * + `Added`/`Removed` on `NetId` (PLAN 4.13). Late join still uses `serializeWorld`.
 */
export function serializeDelta(world: World): WorldSnapshot {
  const ownedChanged = ownedByChangedIds(world);
  const full = serializeWorld(world, { skipOwnedByCache: true });
  const include = new Set<number>(ownedChanged);
  const added: number[] = [];
  const removed: number[] = [];
  world.query(Changed(Transform), NetId).useStores(([_tfs, nets], entities) => {
    for (const e of entities) {
      const id = nets.id[e.id()];
      if (id != null) include.add(id);
    }
  });
  for (const trait of DELTA_TRAITS) {
    if (trait === Transform) continue;
    world.query(Changed(trait), NetId).updateEach(([_v, net]) => {
      include.add(net.id);
    });
  }
  world.query(Added(NetId)).updateEach(([net]) => {
    include.add(net.id);
    added.push(net.id);
  });
  world.query(Removed(NetId)).updateEach(([net]) => {
    removed.push(net.id);
  });
  return {
    ...full,
    full: false,
    added,
    removed,
    entities: full.entities.filter((e) => include.has(e.netId)),
  };
}

export function mergeSnapshot(base: WorldSnapshot, delta: WorldSnapshot): WorldSnapshot {
  const byNet = new Map<number, TraitSnapshot>();
  for (const e of base.entities) byNet.set(e.netId, e);
  for (const e of delta.entities) {
    const prev = byNet.get(e.netId);
    byNet.set(e.netId, prev ? { netId: e.netId, traits: { ...prev.traits, ...e.traits } } : e);
  }
  for (const id of delta.removed ?? []) byNet.delete(id);
  return {
    ...delta,
    full: true,
    entities: [...byNet.values()].sort((a, b) => a.netId - b.netId),
    added: delta.added,
    removed: delta.removed,
  };
}

function projectileNeedsBody(kind: number): boolean {
  return (
    kind === ProjectileKind.Grenade ||
    kind === ProjectileKind.Rocket ||
    kind === ProjectileKind.Field ||
    kind === ProjectileKind.Creature ||
    kind === ProjectileKind.BurstInto
  );
}

function applyLinearVelocity(world: World, entity: Entity, vx: number, vy: number): void {
  getContext(world).bodies.get(entity)?.setLinearVelocity({ x: vx, y: vy });
}

/**
 * PLAN 4.13: dynamic bodies (loose weapons, projectile bodies, props, ragdolls)
 * replicate linear + angular velocity. PhysBody itself stays `local`.
 */
function readBodyVel(
  world: World,
  entity: Entity,
): { vx: number; vy: number; omega: number } | undefined {
  const body = getContext(world).bodies.get(entity);
  if (!body || !body.isActive()) return undefined;
  if (body.getType() === 'static') return undefined;
  const v = body.getLinearVelocity();
  return { vx: v.x, vy: v.y, omega: body.getAngularVelocity() };
}

function writeBodyVel(world: World, entity: Entity, rec: TraitSnapshot): void {
  const bv = rec.traits.BodyVel;
  if (!bv) return;
  const body = getContext(world).bodies.get(entity);
  if (!body || !body.isActive()) return;
  body.setLinearVelocity({ x: Number(bv.vx ?? 0), y: Number(bv.vy ?? 0) });
  body.setAngularVelocity(Number(bv.omega ?? 0));
}

function applyRecord(world: World, entity: Entity, rec: TraitSnapshot, full: boolean): void {
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
  const pl = rec.traits.Player;
  const curP = entity.get(Player);
  if (pl && curP) {
    entity.set(Player, {
      slot: Number(pl.slot ?? curP.slot),
      color: Number(pl.color ?? curP.color),
      inputIndex: Number(pl.inputIndex ?? curP.inputIndex),
    });
  }
  const c = rec.traits.Controller;
  const curC = entity.get(Controller);
  if (c && curC) {
    entity.set(Controller, {
      ...curC,
      grounded: Boolean(c.grounded),
      facing: Number(c.facing),
      vx: Number(c.vx ?? curC.vx),
      vy: Number(c.vy ?? curC.vy),
      ducking: c.ducking != null ? Boolean(Number(c.ducking)) : curC.ducking,
      wallSliding: c.wallSliding != null ? Boolean(Number(c.wallSliding)) : curC.wallSliding,
      wallDir: Number(c.wallDir ?? curC.wallDir),
      coyote: Number(c.coyote ?? curC.coyote),
      jumpBuffer: Number(c.jumpBuffer ?? curC.jumpBuffer),
      lockTicks: Number(c.lockTicks ?? curC.lockTicks),
    });
    applyLinearVelocity(world, entity, Number(c.vx ?? curC.vx), Number(c.vy ?? curC.vy));
  }
  const a = rec.traits.Aim;
  const curA = entity.get(Aim);
  if (a && curA) {
    entity.set(Aim, {
      ...curA,
      x: Number(a.x),
      y: Number(a.y),
      holdTicks: Number(a.holdTicks ?? curA.holdTicks),
    });
  }
  const cb = rec.traits.Combat;
  const curCb = entity.get(Combat);
  if (cb && curCb) {
    entity.set(Combat, {
      ...curCb,
      blockMeter: Number(cb.blockMeter ?? curCb.blockMeter),
      blocking: Boolean(cb.blocking),
      punchActive: Number(cb.punchActive ?? curCb.punchActive),
      blockStartTick: Number(cb.blockStartTick ?? curCb.blockStartTick),
      punchCooldown: Number(cb.punchCooldown ?? curCb.punchCooldown),
      refillDelay: Number(cb.refillDelay ?? curCb.refillDelay),
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
      thrownHit: Boolean(Number(w.thrownHit ?? (curW.thrownHit ? 1 : 0))),
      pickupCooldown: Number(w.pickupCooldown ?? curW.pickupCooldown),
    });
    applyHeldFlags(world, entity, w);
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
      damage: Number(pr.damage ?? curPr.damage),
      fuse: Number(pr.fuse ?? curPr.fuse),
      defId: Number(pr.defId ?? curPr.defId),
      speed: Number(pr.speed ?? curPr.speed),
      bounces: Number(pr.bounces ?? curPr.bounces),
      gravity: Number(pr.gravity ?? curPr.gravity),
      ownerGrace: Number(pr.ownerGrace ?? curPr.ownerGrace),
    });
    const pbody = ctx.bodies.get(entity);
    if (pbody) {
      pbody.setPosition({ x: Number(pr.x), y: Number(pr.y) });
      pbody.setLinearVelocity({ x: Number(pr.vx), y: Number(pr.vy) });
    }
  }
  const st = rec.traits.Status;
  if (st) {
    const next = {
      burning: Number(st.burning ?? 0),
      slowed: Number(st.slowed ?? 0),
      glued: Number(st.glued ?? 0),
      bubbled: Number(st.bubbled ?? 0),
    };
    if (entity.get(Status)) entity.set(Status, next);
    else entity.add(Status(next));
  }
  const sn = rec.traits.Snake;
  const curSn = entity.get(Snake);
  if (sn && curSn) {
    entity.set(Snake, {
      ...curSn,
      hp: Number(sn.hp ?? curSn.hp),
      giant: Number(sn.giant ?? curSn.giant),
      flying: Number(sn.flying ?? curSn.flying),
      biteCooldown: Number(sn.biteCooldown ?? curSn.biteCooldown),
    });
  }
  const hz = rec.traits.Hazard;
  const curHz = entity.get(Hazard);
  if (hz && curHz) {
    entity.set(Hazard, {
      ...curHz,
      kind: Number(hz.kind ?? curHz.kind),
      param0: Number(hz.param0 ?? curHz.param0),
      param1: Number(hz.param1 ?? curHz.param1),
      param2: Number(hz.param2 ?? curHz.param2),
      param3: Number(hz.param3 ?? curHz.param3),
      hp: Number(hz.hp ?? curHz.hp),
      armed: Number(hz.armed ?? curHz.armed),
    });
  }
  const life = rec.traits.Lifetime;
  if (life) {
    const ticksLeft = Number(life.ticksLeft ?? 0);
    if (entity.get(Lifetime)) entity.set(Lifetime, { ticksLeft });
    else entity.add(Lifetime({ ticksLeft }));
  }
  const dest = rec.traits.Destructible;
  if (dest && entity.get(Destructible)) {
    entity.set(Destructible, { hp: Number(dest.hp), maxHp: Number(dest.maxHp ?? dest.hp) });
  }
  const boss = rec.traits.Boss;
  if (boss) {
    const next = {
      hp: Number(boss.hp ?? 200),
      bite: Number(boss.bite ?? 0),
      speed: Number(boss.speed ?? 3.2),
    };
    if (entity.get(Boss)) entity.set(Boss, next);
    else entity.add(Boss(next));
  }
  if (rec.traits.Crown && !entity.has(Crown)) entity.add(Crown());
  const path = rec.traits.HazardPath;
  if (path) {
    const points = String(path.points ?? '')
      .split(';')
      .map((pair) => {
        const [px, py] = pair.split(',');
        return { x: Number(px), y: Number(py) };
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const next = {
      points: points.length ? points : (entity.get(HazardPath)?.points ?? []),
      index: Number(path.index ?? 0),
      accum: Number(path.accum ?? 0),
      mode: Number(path.mode ?? 0),
      dir: Number(path.dir ?? 1),
      speed: Number(path.speed ?? 3),
    };
    if (entity.get(HazardPath)) entity.set(HazardPath, next);
    else entity.add(HazardPath(next));
  }
  const addTag = (key: string, add: () => void, remove: () => void, has: boolean) => {
    const flag = rec.traits[key];
    if (flag && Number(flag.on) === 1) {
      if (!has) add();
    } else if (full && !flag && has) {
      remove();
    }
  };
  addTag('Dead', () => entity.add(Dead()), () => entity.remove(Dead), entity.has(Dead));
  addTag('Static', () => entity.add(Static()), () => entity.remove(Static), entity.has(Static));
  addTag(
    'Kinematic',
    () => entity.add(Kinematic()),
    () => entity.remove(Kinematic),
    entity.has(Kinematic),
  );
  addTag('Solid', () => entity.add(Solid()), () => entity.remove(Solid), entity.has(Solid));
  addTag('Loose', () => entity.add(Loose()), () => entity.remove(Loose), entity.has(Loose));
  addTag('Held', () => entity.add(Held()), () => entity.remove(Held), entity.has(Held));
  if (h) {
    if (Number(h.hp) <= 0) {
      if (!entity.has(Dead)) entity.add(Dead());
      if (entity.has(Player) && entity.has(Controller) && ctx.bodies.get(entity)) {
        destroyBody(world, entity);
      }
    } else if (entity.has(Dead)) {
      entity.remove(Dead);
    }
  }
  writeBodyVel(world, entity, rec);
}

function applyHeldFlags(
  world: World,
  entity: Entity,
  w: Record<string, number | boolean | string>,
): void {
  const ctx = getContext(world);
  const held = Number(w.held) === 1;
  if (held) {
    if (!entity.has(Held)) entity.add(Held());
    if (entity.has(Loose)) entity.remove(Loose);
    ctx.bodies.get(entity)?.setActive(false);
  } else {
    if (entity.has(Held)) entity.remove(Held);
    if (!entity.has(Loose)) entity.add(Loose());
    entity.remove(HeldBy('*'));
    ctx.bodies.get(entity)?.setActive(true);
  }
}

function entityByNetId(world: World, id: number): Entity | undefined {
  let found: Entity | undefined;
  world.query(NetId).updateEach(([n], e) => {
    if (n.id === id) found = e;
  });
  return found;
}

function livingSeatBySlot(world: World, slot: number): Entity | undefined {
  let found: Entity | undefined;
  world.query(Player, NetId).updateEach(([p], e) => {
    if (p.slot === slot && e.has(Controller)) found = e;
  });
  return found;
}

function applyHeldLinks(world: World, snap: WorldSnapshot): void {
  for (const rec of snap.entities) {
    const w = rec.traits.Weapon;
    if (!w || Number(w.held) !== 1) continue;
    const weapon = entityByNetId(world, rec.netId);
    let holder = entityByNetId(world, Number(w.holderNetId));
    if (!holder) {
      const holderSnap = snap.entities.find((e) => e.netId === Number(w.holderNetId));
      const slot = holderSnap?.traits.Player?.slot;
      if (slot != null) holder = livingSeatBySlot(world, Number(slot));
    }
    if (!weapon || !holder) continue;
    weapon.remove(HeldBy('*'));
    weapon.add(Held(), HeldBy(holder));
    if (weapon.has(Loose)) weapon.remove(Loose);
    getContext(world).bodies.get(weapon)?.setActive(false);
  }
}

function applyOwnedByLinks(world: World, snap: WorldSnapshot): void {
  for (const rec of snap.entities) {
    const ob = rec.traits.OwnedBy;
    if (!ob) continue;
    const entity = entityByNetId(world, rec.netId);
    let owner = entityByNetId(world, Number(ob.ownerNetId));
    if (!owner) {
      const ownerSnap = snap.entities.find((e) => e.netId === Number(ob.ownerNetId));
      const slot = ownerSnap?.traits.Player?.slot;
      if (slot != null) owner = livingSeatBySlot(world, Number(slot));
    }
    if (!entity || !owner) continue;
    entity.remove(OwnedBy('*'));
    entity.add(OwnedBy(owner));
  }
}

function applyPartOfLinks(world: World, snap: WorldSnapshot, newRootNetIds: Set<number>): void {
  for (const rec of snap.entities) {
    const rp = rec.traits.RagdollPart;
    if (!rp) continue;
    const part = entityByNetId(world, rec.netId);
    const root = entityByNetId(world, Number(rp.rootNetId));
    if (!part || !root) continue;
    part.remove(PartOf('*'));
    part.add(PartOf(root));
  }
  const built = ragdollJointsBuilt.get(world) ?? new Set<number>();
  ragdollJointsBuilt.set(world, built);
  for (const rootId of newRootNetIds) {
    if (built.has(rootId)) continue;
    const root = entityByNetId(world, rootId);
    if (!root) continue;
    if (attachRagdollJoints(world, root) >= RAGDOLL_JOINTS.length) built.add(rootId);
  }
}

function applyWorldTraits(world: World, snap: WorldSnapshot): void {
  const rs = world.get(RoundState);
  if (rs && snap.phase != null) {
    world.set(RoundState, {
      ...rs,
      phase: snap.phase,
      ticks: snap.roundTicks ?? rs.ticks,
      aliveMask: snap.aliveMask ?? rs.aliveMask,
      lastKiller: snap.lastKiller ?? rs.lastKiller,
      seed: snap.seed ?? rs.seed,
    });
  }
  const ms = world.get(MatchState);
  if (ms && snap.wins) {
    const next = {
      ...ms,
      wins0: snap.wins[0] ?? 0,
      wins1: snap.wins[1] ?? 0,
      wins2: snap.wins[2] ?? 0,
      wins3: snap.wins[3] ?? 0,
      round: snap.matchRound ?? ms.round,
      firstTo: snap.firstTo ?? ms.firstTo,
      levelIndex: snap.levelIndex ?? ms.levelIndex,
      rotation: snap.rotation ?? ms.rotation,
      showWins: snap.showWins ?? ms.showWins,
      maxHp: snap.maxHp ?? ms.maxHp,
    };
    world.set(MatchState, next);
  }
  const drop = world.get(DropState);
  if (drop && snap.nextDrop != null) {
    world.set(DropState, {
      nextDrop: snap.nextDrop,
      looseCount: snap.looseCount ?? drop.looseCount,
    });
  }
  const clock = world.get(SimClock);
  if (clock) {
    world.set(SimClock, {
      tick: snap.tick,
      stepScale: snap.stepScale ?? clock.stepScale,
    });
  }
}

/** Late-join: host-spawned weapons / projectiles / snakes / ragdolls / debris are not in the client's level load. */
function spawnMissing(
  world: World,
  rec: TraitSnapshot,
  newRootNetIds: Set<number>,
  newHazardNetIds: Set<number>,
): void {
  if (rec.traits.Player) return;
  const ctx = getContext(world);
  const t = rec.traits.Transform;
  const w = rec.traits.Weapon;
  const pr = rec.traits.Projectile;
  const sn = rec.traits.Snake;
  const rp = rec.traits.RagdollPart;
  const root = rec.traits.RagdollRoot;
  const hz = rec.traits.Hazard;
  const x = Number(t?.x ?? pr?.x ?? 0);
  const y = Number(t?.y ?? pr?.y ?? 0);
  const angle = Number(t?.angle ?? 0);

  if (root) {
    world.spawn(
      Player({
        slot: Number(root.slot ?? 0),
        color: Number(root.color ?? 0),
        inputIndex: Number(root.inputIndex ?? root.slot ?? 0),
      }),
      Dead(),
      Health({
        hp: 0,
        maxHp: Number(rec.traits.Health?.maxHp ?? 100),
      }),
      NetId({ id: rec.netId }),
    );
    newRootNetIds.add(rec.netId);
    return;
  }

  if (w) {
    const entity = world.spawn(
      Weapon({
        defId: Number(w.defId),
        ammo: Number(w.ammo ?? 0),
        pickupCooldown: Number(w.pickupCooldown ?? 0),
        thrown: Boolean(w.thrown),
        thrownHit: Boolean(Number(w.thrownHit ?? 0)),
      }),
      Transform({ x, y, angle }),
      PrevTransform({ x, y, angle }),
      NetId({ id: rec.netId }),
    );
    applyHeldFlags(world, entity, w);
    const body = createBoxBody(ctx.physics, entity, 'weapon', x, y, 0.28, 0.12, 'dynamic', {
      density: 0.35,
      friction: 0.4,
      restitution: 0.1,
      fixedRotation: false,
    });
    registerBody(world, entity, body);
    if (Number(w.held) === 1) body.setActive(false);
    writeBodyVel(world, entity, rec);
    return;
  }

  if (pr) {
    const kind = Number(pr.kind ?? 0);
    const px = Number(pr.x ?? x);
    const py = Number(pr.y ?? y);
    const vx = Number(pr.vx ?? 0);
    const vy = Number(pr.vy ?? 0);
    const gravity = Number(pr.gravity ?? 0);
    const entity = world.spawn(
      Projectile({
        kind,
        damage: Number(pr.damage ?? 0),
        speed: Number(pr.speed ?? 0),
        bounces: Number(pr.bounces ?? 0),
        fuse: Number(pr.fuse ?? 0),
        x: px,
        y: py,
        vx,
        vy,
        gravity,
        ownerGrace: Number(pr.ownerGrace ?? 0),
        defId: Number(pr.defId ?? 0),
      }),
      Transform({ x: px, y: py, angle }),
      PrevTransform({ x: px, y: py, angle }),
      NetId({ id: rec.netId }),
    );
    if (projectileNeedsBody(kind)) {
      const body = createBoxBody(ctx.physics, entity, 'projectile', px, py, 0.14, 0.14, 'dynamic', {
        density: 0.4,
        friction: 0.2,
        restitution: 0.05,
        bullet: true,
        fixedRotation: false,
      });
      body.setLinearVelocity({ x: vx, y: vy });
      body.setGravityScale(gravity > 0 ? gravity / ctx.tuning.gravity : 0);
      registerBody(world, entity, body);
    }
    writeBodyVel(world, entity, rec);
    return;
  }

  if (sn) {
    const hp = Number(sn.hp ?? 5);
    const entity = world.spawn(
      Snake({
        hp,
        giant: Number(sn.giant ?? 0),
        flying: Number(sn.flying ?? 0),
        biteCooldown: Number(sn.biteCooldown ?? 0),
      }),
      Health({ hp, maxHp: hp }),
      Transform({ x, y, angle }),
      PrevTransform({ x, y, angle }),
      NetId({ id: rec.netId }),
    );
    const giant = Number(sn.giant ?? 0) === 1;
    const body = createBoxBody(
      ctx.physics,
      entity,
      'projectile',
      x,
      y,
      giant ? 0.35 : 0.18,
      giant ? 0.18 : 0.1,
      'dynamic',
      { density: 0.5, friction: 0.3, fixedRotation: true },
    );
    if (Number(sn.flying) === 1) body.setGravityScale(0);
    registerBody(world, entity, body);
    writeBodyVel(world, entity, rec);
    return;
  }

  if (rp && t) {
    const spec = ragdollPartSpec(Number(rp.part ?? 0));
    const entity = world.spawn(
      RagdollPart({ part: spec.part }),
      Transform({ x, y, angle }),
      PrevTransform({ x, y, angle }),
      NetId({ id: rec.netId }),
    );
    const body = spec.circle
      ? createCircleBody(ctx.physics, entity, 'ragdoll', x, y, spec.hx, 'dynamic', {
          density: 0.8,
          friction: 0.4,
          restitution: 0.05,
        })
      : createBoxBody(ctx.physics, entity, 'ragdoll', x, y, spec.hx, spec.hy, 'dynamic', {
          density: 0.9,
          friction: 0.45,
          restitution: 0.05,
          fixedRotation: false,
        });
    registerBody(world, entity, body);
    writeBodyVel(world, entity, rec);
    const rootId = Number(rp.rootNetId);
    if (rootId >= 0) newRootNetIds.add(rootId);
    return;
  }

  if (hz) {
    const kind = Number(hz.kind ?? 0);
    const params = {
      param0: Number(hz.param0 ?? 0),
      param1: Number(hz.param1 ?? 0),
      param2: Number(hz.param2 ?? 0),
      param3: Number(hz.param3 ?? 0),
    };
    const spec = applyBodyShapeToSpec(
      lateJoinBodySpec(kind, params, {
        isStatic: Boolean(rec.traits.Static),
        chainDeck: kind === HazardKind.Chain && params.param3 === 1,
        spikeStyle: kind === HazardKind.Spikeball ? params.param2 : 0,
      }),
      rec.traits.BodyShape,
    );
    const dest = rec.traits.Destructible;
    const life = rec.traits.Lifetime;
    const boss = rec.traits.Boss;
    const entity = world.spawn(
      Transform({ x, y, angle }),
      PrevTransform({ x, y, angle }),
      Hazard({
        kind,
        param0: params.param0,
        param1: params.param1,
        param2: params.param2,
        param3: params.param3,
        hp: Number(hz.hp ?? 0),
        armed: Number(hz.armed ?? 1),
      }),
      NetId({ id: rec.netId }),
    );
    if (dest) entity.add(Destructible({ hp: Number(dest.hp), maxHp: Number(dest.maxHp ?? dest.hp) }));
    if (life) entity.add(Lifetime({ ticksLeft: Number(life.ticksLeft ?? 50) }));
    if (boss) {
      entity.add(
        Boss({
          hp: Number(boss.hp ?? 200),
          bite: Number(boss.bite ?? 0),
          speed: Number(boss.speed ?? 3.2),
        }),
      );
    }
    if (spec.bodyType === 'static') entity.add(Static());
    if (spec.bodyType === 'kinematic') entity.add(Kinematic());
    if (spec.fixtureKind === 'solid') entity.add(Solid());
    createLateJoinHazardBody(world, entity, spec, x, y, angle);
    if (kind === HazardKind.Chain && spec.bodyType === 'dynamic') {
      const chainBody = ctx.bodies.get(entity);
      if (chainBody) isolateChainBody(chainBody);
    }
    newHazardNetIds.add(rec.netId);
    applyRecord(world, entity, rec, true);
    writeBodyVel(world, entity, rec);
    return;
  }

  if (t && rec.traits.BodyVel) {
    const entity = world.spawn(
      Transform({ x, y, angle }),
      PrevTransform({ x, y, angle }),
      NetId({ id: rec.netId }),
    );
    const body = createBoxBody(ctx.physics, entity, 'prop', x, y, 0.4, 0.4, 'dynamic', {
      density: 1,
      friction: 0.4,
      restitution: 0.05,
      fixedRotation: false,
    });
    registerBody(world, entity, body);
    writeBodyVel(world, entity, rec);
  }
}

function safeDestroyEntity(world: World, entity: Entity): void {
  if (!world.has(entity)) return;
  destroyBody(world, entity);
  if (!world.has(entity)) return;
  try {
    entity.destroy();
  } catch {
    /* already destroyed after death/respawn/level swap */
  }
}

function pruneMissingFromFull(world: World, snap: WorldSnapshot): void {
  if (snap.full === false) return;
  const keep = new Set(snap.entities.map((e) => e.netId));
  const kill: Entity[] = [];
  world.query(NetId).updateEach(([net], entity) => {
    if (keep.has(net.id)) return;
    if (entity.has(Player) && entity.has(Controller)) return;
    kill.push(entity);
  });
  for (const entity of kill) safeDestroyEntity(world, entity);
}

/** PLAN 4.13: a full snap may include seats that joined after this client world was built. */
function ensureSnapshotSeats(world: World, snap: WorldSnapshot): void {
  const fromPlayers = snap.entities.filter((e) => e.traits.Player).length;
  const seats = Math.min(4, Math.max(1, snap.playerCount ?? fromPlayers));
  const ctx = getContext(world);
  for (let slot = 0; slot < seats; slot++) {
    let exists = false;
    world.query(Player, Controller).updateEach(([p]) => {
      if (p.slot === slot) exists = true;
    });
    if (exists) continue;
    const rec = snap.entities.find((e) => Number(e.traits.Player?.slot) === slot);
    const color = Number(rec?.traits.Player?.color ?? slot);
    const inputIndex = Number(rec?.traits.Player?.inputIndex ?? slot);
    const spawn = ctx.level.spawns[slot % Math.max(1, ctx.level.spawns.length)] ?? { x: 8, y: 6 };
    spawnPlayer(world, slot, spawn.x, spawn.y + 1, color, inputIndex);
    ctx.settings.playerCount = Math.max(ctx.settings.playerCount, slot + 1);
  }
}

/** Interp: write lerped BodyVel onto live bodies after `restoreWorld(to)`. */
export function applyInterpolatedBodyVel(
  world: World,
  from: WorldSnapshot,
  to: WorldSnapshot,
  alpha: number,
): void {
  const fromBy = new Map(from.entities.map((e) => [e.netId, e.traits.BodyVel]));
  for (const rec of to.entities) {
    const a = fromBy.get(rec.netId);
    const b = rec.traits.BodyVel;
    if (!a && !b) continue;
    const entity = entityByNetId(world, rec.netId);
    if (!entity) continue;
    const t = Math.min(1, Math.max(0, alpha));
    writeBodyVel(world, entity, {
      netId: rec.netId,
      traits: {
        BodyVel: {
          vx: Number(a?.vx ?? b?.vx ?? 0) * (1 - t) + Number(b?.vx ?? 0) * t,
          vy: Number(a?.vy ?? b?.vy ?? 0) * (1 - t) + Number(b?.vy ?? 0) * t,
          omega: Number(a?.omega ?? b?.omega ?? 0) * (1 - t) + Number(b?.omega ?? 0) * t,
        },
      },
    });
  }
}

export function restoreWorld(world: World, snap: WorldSnapshot): void {
  const ctx = getContext(world);
  ctx.rng.setState(snap.rng);
  ctx.ids.setNext(snap.nextId);
  ctx.tick = snap.tick;
  if (snap.removed?.length) {
    const drop = new Set(snap.removed);
    const kill: Entity[] = [];
    world.query(NetId).updateEach(([net], entity) => {
      if (!drop.has(net.id) || entity.has(Player)) return;
      kill.push(entity);
    });
    for (const entity of kill) safeDestroyEntity(world, entity);
  }
  ensureSnapshotSeats(world, snap);
  pruneMissingFromFull(world, snap);
  applyWorldTraits(world, snap);
  const byNet = new Map<number, TraitSnapshot>();
  for (const e of snap.entities) byNet.set(e.netId, e);
  const used = new Set<number>();
  const full = snap.full !== false;
  world.query(NetId).updateEach(([net], entity) => {
    const rec = byNet.get(net.id);
    if (!rec) return;
    used.add(net.id);
    applyRecord(world, entity, rec, full);
  });
  world.query(Player, Controller, NetId).updateEach(([_p, _c, net], entity) => {
    if (used.has(net.id)) return;
    const rec = snap.entities.find((e) => Number(e.traits.Player?.slot) === entity.get(Player)?.slot);
    if (!rec) return;
    used.add(net.id);
    applyRecord(world, entity, rec, full);
  });
  const newRootNetIds = new Set<number>();
  const newHazardNetIds = new Set<number>();
  for (const rec of snap.entities) {
    if (used.has(rec.netId)) continue;
    spawnMissing(world, rec, newRootNetIds, newHazardNetIds);
  }
  attachLateJoinHazardJoints(world, newHazardNetIds);
  applyHeldLinks(world, snap);
  applyOwnedByLinks(world, snap);
  applyPartOfLinks(world, snap, newRootNetIds);
  const match = world.get(MatchState);
  if (match) assignCrownToLeader(world, match);
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
