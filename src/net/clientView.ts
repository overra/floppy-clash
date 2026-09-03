import { gymLevel } from '../levels/gym';
import { getLevel } from '../levels/catalog';
import type { LevelDef } from '../sim/level/schema';
import { NetId, Player, PrevTransform, Transform } from '../sim/traits';
import { mergeSnapshot, restoreWorld, type WorldSnapshot } from '../sim/snapshot';
import { createSimWorld, type SimHandle } from '../sim/world';
import { createInterpBuffer } from './interp';

export type ClientView = {
  sim: SimHandle;
  appliedTick: number;
  appliedX: number;
  restored: boolean;
  alpha: number;
  push: (at: number, snap: WorldSnapshot) => void;
  apply: (now: number) => WorldSnapshot | null;
};

export function worldFromSnapshot(snap: WorldSnapshot, levelOverride?: LevelDef): SimHandle {
  let level = levelOverride ?? gymLevel;
  if (!levelOverride && snap.levelId) {
    try {
      level = getLevel(snap.levelId);
    } catch {
      level = gymLevel;
    }
  }
  const fromPlayers = snap.entities.filter((e) => e.traits.Player).length;
  const playerCount = Math.max(1, snap.playerCount ?? fromPlayers);
  return createSimWorld({
    level,
    seed: snap.seed ?? 1,
    settings: { playerCount, bots: 0 },
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
  const sim = worldFromSnapshot(first, level);
  restoreWorld(sim.ecs, first);
  const buffer = createInterpBuffer(delayMs);
  let acc: WorldSnapshot = first.full === false ? { ...first, full: true } : first;
  const view: ClientView = {
    sim,
    appliedTick: first.tick,
    appliedX: 0,
    restored: true,
    alpha: 1,
    push(at, snap) {
      const merged = snap.full === false ? mergeSnapshot(acc, snap) : snap;
      acc = merged;
      buffer.push(at, merged);
    },
    apply(now) {
      const pair = buffer.samplePair(now);
      const snap = pair?.to ?? buffer.sample(now);
      if (!snap) return null;
      if (pair?.from && pair.from !== pair.to) applyPrevFromSnap(sim.ecs, pair.from);
      restoreWorld(sim.ecs, snap);
      view.alpha = pair?.alpha ?? 1;
      view.appliedTick = snap.tick;
      view.restored = true;
      sim.ecs.query(Player, Transform).updateEach(([p, t]) => {
        if (p.slot === 0) view.appliedX = t.x;
      });
      return snap;
    },
  };
  sim.ecs.query(Player, Transform).updateEach(([p, t]) => {
    if (p.slot === 0) view.appliedX = t.x;
  });
  return view;
}
