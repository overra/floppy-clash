import { createAdded, createChanged, createRemoved, type Entity, type World } from 'koota';
import { fnv1a, hashToHex, quantize } from '../core/hash';
import { createBoxBody, createCircleBody, destroyBody, registerBody } from './physics/bodies';
import { getContext } from './context';
import { attachRagdollJoints, isRagdollRoot, ragdollPartSpec, RAGDOLL_JOINTS } from './player/ragdoll';
import {
  Aim,
  Combat,
  Controller,
  Dead,
  Destructible,
  Hazard,
  HazardKind,
  Health,
  Held,
  HeldBy,
  Lifetime,
  Loose,
  MatchState,
  NetId,
  OwnedBy,
  PartOf,
  Player,
  PrevTransform,
  Projectile,
  RagdollPart,
  RoundState,
  Snake,
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
  entities: TraitSnapshot[];
  /** false = Changed(Transform) + Added/Removed NetId (PLAN 4.13). Late join uses full. */
  full?: boolean;
  added?: number[];
  removed?: number[];
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
    if (p) {
      if (isRagdollRoot(entity)) {
        snap.traits.RagdollRoot = { slot: p.slot, color: p.color };
      } else {
        snap.traits.Player = { slot: p.slot, color: p.color, inputIndex: p.inputIndex };
      }
    }
    const c = entity.get(Controller);
    if (c) snap.traits.Controller = { grounded: c.grounded, facing: c.facing, vx: c.vx, vy: c.vy };
    const a = entity.get(Aim);
    if (a) snap.traits.Aim = { x: a.x, y: a.y };
    const w = entity.get(Weapon);
    if (w) {
      const holder = entity.has(Held) ? entity.targetFor(HeldBy) : undefined;
      snap.traits.Weapon = {
        defId: w.defId,
        ammo: w.ammo,
        thrown: w.thrown,
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
      };
    }
    const sn = entity.get(Snake);
    if (sn) snap.traits.Snake = { hp: sn.hp, giant: sn.giant, flying: sn.flying };
    const rp = entity.get(RagdollPart);
    if (rp) {
      const root = entity.targetFor(PartOf);
      snap.traits.RagdollPart = { part: rp.part, rootNetId: root?.get(NetId)?.id ?? -1 };
    }
    const cb = entity.get(Combat);
    if (cb) snap.traits.Combat = { blockMeter: cb.blockMeter, blocking: cb.blocking };
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
    entities.push(snap);
  });
  entities.sort((a, b) => a.netId - b.netId);
  const rs = world.get(RoundState);
  const ms = world.get(MatchState);
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
    entities,
    full: true,
  };
}

/** Consume change trackers after a full snapshot so the next delta is incremental. */
export function drainChangeTrackers(world: World): void {
  world.query(Changed(Transform)).forEach(() => undefined);
  world.query(Added(NetId)).forEach(() => undefined);
  world.query(Removed(NetId)).forEach(() => undefined);
}

/**
 * Delta snapshot: `Changed(Transform)` + `Added`/`Removed` on `NetId` (PLAN 4.13).
 * Transform stores are read via `useStores` (SoA). Late join still uses `serializeWorld`.
 */
export function serializeDelta(world: World): WorldSnapshot {
  const full = serializeWorld(world);
  const include = new Set<number>();
  const added: number[] = [];
  const removed: number[] = [];
  world.query(Changed(Transform), NetId).useStores(([_tfs, nets], entities) => {
    for (const e of entities) {
      const id = nets.id[e.id()];
      if (id != null) include.add(id);
    }
  });
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
    });
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
    world.set(MatchState, {
      ...ms,
      wins0: snap.wins[0] ?? 0,
      wins1: snap.wins[1] ?? 0,
      wins2: snap.wins[2] ?? 0,
      wins3: snap.wins[3] ?? 0,
      round: snap.matchRound ?? ms.round,
    });
  }
}

/** Late-join: host-spawned weapons / projectiles / snakes / ragdolls / debris are not in the client's level load. */
function spawnMissing(world: World, rec: TraitSnapshot, newRootNetIds: Set<number>): void {
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
        inputIndex: Number(root.slot ?? 0),
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
        pickupCooldown: 0,
        thrown: Boolean(w.thrown),
        thrownHit: false,
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
    return;
  }

  if (pr) {
    world.spawn(
      Projectile({
        kind: Number(pr.kind ?? 0),
        damage: Number(pr.damage ?? 0),
        speed: Number(pr.speed ?? 0),
        bounces: 0,
        fuse: Number(pr.fuse ?? 0),
        x: Number(pr.x ?? x),
        y: Number(pr.y ?? y),
        vx: Number(pr.vx ?? 0),
        vy: Number(pr.vy ?? 0),
        gravity: 0,
        ownerGrace: 0,
        defId: Number(pr.defId ?? 0),
      }),
      NetId({ id: rec.netId }),
    );
    return;
  }

  if (sn) {
    const hp = Number(sn.hp ?? 5);
    const entity = world.spawn(
      Snake({
        hp,
        giant: Number(sn.giant ?? 0),
        flying: Number(sn.flying ?? 0),
        biteCooldown: 0,
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
    const rootId = Number(rp.rootNetId);
    if (rootId >= 0) newRootNetIds.add(rootId);
    return;
  }

  if (hz && t && Number(hz.kind) === HazardKind.Debris) {
    const hx = Number(hz.param0 ?? 0.24) / 2;
    const hy = Number(hz.param1 ?? 0.24) / 2;
    const entity = world.spawn(
      Transform({ x, y, angle }),
      PrevTransform({ x, y, angle }),
      Hazard({
        kind: HazardKind.Debris,
        param0: Number(hz.param0 ?? 0.24),
        param1: Number(hz.param1 ?? 0.24),
        param2: Number(hz.param2 ?? 0),
        param3: Number(hz.param3 ?? 0),
        hp: Number(hz.hp ?? 0),
        armed: Number(hz.armed ?? 1),
      }),
      Lifetime({ ticksLeft: Number(rec.traits.Lifetime?.ticksLeft ?? 50) }),
      NetId({ id: rec.netId }),
    );
    const body = createBoxBody(ctx.physics, entity, 'prop', x, y, hx, hy, 'dynamic', {
      density: 0.35,
      friction: 0.4,
      restitution: 0.15,
      fixedRotation: false,
    });
    registerBody(world, entity, body);
    return;
  }

  if (t) {
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
  for (const entity of kill) {
    destroyBody(world, entity);
    entity.destroy();
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
    for (const entity of kill) {
      destroyBody(world, entity);
      entity.destroy();
    }
  }
  pruneMissingFromFull(world, snap);
  applyWorldTraits(world, snap);
  const byNet = new Map<number, TraitSnapshot>();
  for (const e of snap.entities) byNet.set(e.netId, e);
  const used = new Set<number>();
  world.query(NetId).updateEach(([net], entity) => {
    const rec = byNet.get(net.id);
    if (!rec) return;
    used.add(net.id);
    applyRecord(world, entity, rec);
  });
  world.query(Player, Controller, NetId).updateEach(([_p, _c, net], entity) => {
    if (used.has(net.id)) return;
    const rec = snap.entities.find((e) => Number(e.traits.Player?.slot) === entity.get(Player)?.slot);
    if (!rec) return;
    used.add(net.id);
    applyRecord(world, entity, rec);
  });
  const newRootNetIds = new Set<number>();
  for (const rec of snap.entities) {
    if (used.has(rec.netId)) continue;
    spawnMissing(world, rec, newRootNetIds);
  }
  applyHeldLinks(world, snap);
  applyOwnedByLinks(world, snap);
  applyPartOfLinks(world, snap, newRootNetIds);
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
