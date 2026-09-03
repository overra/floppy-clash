import { gymLevel } from '../levels/gym';
import { findLevel } from '../levels/catalog';
import type { LevelDef } from '../sim/level/schema';
import { NetId, Player, PrevTransform, Transform } from '../sim/traits';
import { applyInterpolatedBodyVel, mergeSnapshot, restoreWorld, type WorldSnapshot } from '../sim/snapshot';
import { createSimWorld, type SimHandle } from '../sim/world';
import { createInterpBuffer } from './interp';

export type ClientView = {
  sim: SimHandle;
  appliedTick: number;
  appliedX: number;
  restored: boolean;
  alpha: number;
  /** Host custom-level JSON for the next rebuild (rotation / late user maps). */
  useLevel: (level: LevelDef) => void;
  push: (at: number, snap: WorldSnapshot) => void;
  apply: (now: number) => WorldSnapshot | null;
};

export function worldFromSnapshot(snap: WorldSnapshot, levelOverride?: LevelDef): SimHandle {
  let level: LevelDef;
  if (levelOverride) {
    level = levelOverride;
  } else if (!snap.levelId) {
    level = gymLevel;
  } else {
    const found = findLevel(snap.levelId);
    if (!found) {
      throw new Error(
        `worldFromSnapshot: custom level "${snap.levelId}" requires the host JSON override`,
      );
    }
    level = found;
  }
  const fromPlayers = snap.entities.filter((e) => e.traits.Player).length;
  const playerCount = Math.max(1, snap.playerCount ?? fromPlayers);
  return createSimWorld({
    level,
    seed: snap.seed ?? 1,
    settings: {
      playerCount,
      bots: 0,
      maxHp: snap.maxHp ?? 100,
      firstTo: snap.firstTo ?? 0,
    },
    boxes: 0,
  });
}

export function applyPrevFromSnap(world: SimHandle['ecs'], snap: WorldSnapshot): void {
  const byNet = new Map<number, (typeof snap.entities)[0]>();
  for (const e of snap.entities) byNet.set(e.netId, e);
  world.query(NetId).updateEach(([net], entity) => {
    let rec = byNet.get(net.id);
    if (!rec) {
      const slot = entity.get(Player)?.slot;
      if (slot != null) rec = snap.entities.find((e) => Number(e.traits.Player?.slot) === slot);
    }
    const t = rec?.traits.Transform;
    if (t && entity.has(PrevTransform)) {
      entity.set(PrevTransform, { x: Number(t.x), y: Number(t.y), angle: Number(t.angle) });
    }
  });
}

/** Late-join / interp: restore host snapshot onto a client sim world. */
export function applyLateJoinSnapshot(sim: SimHandle, snap: WorldSnapshot, prev?: WorldSnapshot): void {
  if (prev) applyPrevFromSnap(sim.ecs, prev);
  restoreWorld(sim.ecs, snap);
}

export function createClientView(first: WorldSnapshot, delayMs = 120, level?: LevelDef): ClientView {
  let levelOverride = level;
  let sim = worldFromSnapshot(first, levelOverride);
  restoreWorld(sim.ecs, first);
  const buffer = createInterpBuffer(delayMs);
  let acc: WorldSnapshot = first.full === false ? { ...first, full: true } : first;

  const view: ClientView = {
    sim,
    appliedTick: first.tick,
    appliedX: 0,
    restored: true,
    alpha: 1,
    useLevel(next) {
      levelOverride = next;
    },
    push(at, snap) {
      if (isForeignLevel(snap)) {
        if (snap.full === false) return;
        adoptLevel(snap);
        buffer.push(at, snap);
        return;
      }
      const merged = snap.full === false ? mergeSnapshot(acc, snap) : snap;
      acc = merged;
      buffer.push(at, merged);
    },
    apply(now) {
      const pair = buffer.samplePair(now);
      const snap = pair?.to ?? buffer.sample(now);
      if (!snap) return null;
      if (snap.levelId && snap.levelId !== sim.ctx.level.id && snap.full !== false) {
        adoptLevel(snap);
      }
      const from = pair?.from;
      const sameLevel =
        !from || !from.levelId || !snap.levelId || from.levelId === snap.levelId;
      if (from && from !== snap && sameLevel) applyPrevFromSnap(sim.ecs, from);
      restoreWorld(sim.ecs, snap);
      if (from && from !== snap && sameLevel) {
        applyInterpolatedBodyVel(sim.ecs, from, snap, pair?.alpha ?? 1);
      }
      view.alpha = pair?.alpha ?? 1;
      view.appliedTick = snap.tick;
      view.restored = true;
      sim.ecs.query(Player, Transform).updateEach(([p, t]) => {
        if (p.slot === 0) view.appliedX = t.x;
      });
      return snap;
    },
  };

  function isForeignLevel(snap: WorldSnapshot): boolean {
    return Boolean(snap.levelId && snap.levelId !== (acc.levelId ?? sim.ctx.level.id));
  }

  function adoptLevel(snap: WorldSnapshot): void {
    const override = levelOverride && snap.levelId === levelOverride.id ? levelOverride : undefined;
    sim = worldFromSnapshot(snap, override);
    restoreWorld(sim.ecs, snap);
    buffer.reset();
    acc = snap.full === false ? { ...snap, full: true } : snap;
    view.sim = sim;
  }

  sim.ecs.query(Player, Transform).updateEach(([p, t]) => {
    if (p.slot === 0) view.appliedX = t.x;
  });
  return view;
}
