import { describe, expect, it } from 'vitest';
import type { Entity } from 'koota';
import { Circle } from 'planck';
import { createClientView } from '../src/net/clientView';
import { getLevel } from '../src/levels/catalog';
import { DYNAMIC_APPENDIX_D_KINDS, lateJoinBodySpec } from '../src/sim/hazards/lateJoin';
import { destroyBody } from '../src/sim/physics/bodies';
import { restoreWorld, serializeWorld } from '../src/sim/snapshot';
import { Destructible, Hazard, HazardKind, NetId, PhysBody, SpawnPoint, Static } from '../src/sim/traits';
import { hold, makeSim } from './helpers';
import type { SimHandle } from '../src/sim/world';
import type { Body } from 'planck';

type LateJoinExpect = 'static' | 'dynamic' | 'kinematic';

type BodyMaterial = {
  type: string;
  density: number;
  friction: number;
  circle: boolean;
};

const emptyHz = { param0: 0, param1: 0, param2: 0, param3: 0 };
const liveFlags = { isStatic: false, chainDeck: false, spikeStyle: 0 };

function materialOf(sim: SimHandle, entity: Entity): BodyMaterial {
  const body = sim.ctx.bodies.get(entity);
  const fixture = body?.getFixtureList();
  return {
    type: body?.getType() ?? 'missing',
    density: fixture?.getDensity() ?? -1,
    friction: fixture?.getFriction() ?? -1,
    circle: fixture?.getShape() instanceof Circle,
  };
}

function jointCount(body: Body | undefined): number {
  if (!body) return 0;
  let n = 0;
  for (let edge = body.getJointList(); edge; edge = edge.next) n += 1;
  return n;
}

function boxExtents(sim: SimHandle, entity: Entity): { hx: number; hy: number } {
  const verts = sim.ctx.bodies.get(entity)?.getFixtureList()?.getShape() as
    | { m_vertices?: { x: number; y: number }[] }
    | undefined;
  let hx = 0;
  let hy = 0;
  for (const v of verts?.m_vertices ?? []) {
    hx = Math.max(hx, Math.abs(v.x));
    hy = Math.max(hy, Math.abs(v.y));
  }
  return { hx, hy };
}

function expectNotGenericProp(got: BodyMaterial, kind: number): void {
  if (kind !== HazardKind.Boss) {
    expect(got.density).not.toBeCloseTo(1, 5);
  } else {
    expect(got.density).toBeCloseTo(1.2, 5);
    expect(got.density).not.toBeCloseTo(1, 5);
  }
}

function stealAndRestore(
  host: SimHandle,
  levelId: string,
  pick: (hz: { kind: number; param3: number }, entity: Entity) => boolean,
): { host: BodyMaterial; restored: BodyMaterial; kind: number }[] {
  const wanted: { netId: number; kind: number; host: BodyMaterial }[] = [];
  host.ecs.query(Hazard, NetId).updateEach(([hz, n], e) => {
    if (!pick(hz, e)) return;
    wanted.push({ netId: n.id, kind: hz.kind, host: materialOf(host, e) });
  });
  expect(wanted.length).toBeGreaterThan(0);
  const snap = serializeWorld(host.ecs);
  const view = createClientView(snap, 120, getLevel(levelId));
  const kill: Entity[] = [];
  view.sim.ecs.query(Hazard, NetId).updateEach(([_hz, n], e) => {
    if (wanted.some((row) => row.netId === n.id)) kill.push(e);
  });
  expect(kill.length).toBe(wanted.length);
  for (const e of kill) {
    destroyBody(view.sim.ecs, e);
    e.destroy();
  }
  restoreWorld(view.sim.ecs, snap);
  return wanted.map((row) => {
    let restored: BodyMaterial | null = null;
    view.sim.ecs.query(Hazard, NetId).updateEach(([_hz, n], e) => {
      if (n.id === row.netId) restored = materialOf(view.sim, e);
    });
    expect(restored).not.toBeNull();
    return { host: row.host, restored: restored!, kind: row.kind };
  });
}

describe('lateJoinBodySpec Appendix D materials', () => {
  const cases: {
    name: string;
    kind: number;
    hz?: { param0: number; param1: number; param2: number; param3: number };
    flags?: { isStatic: boolean; chainDeck: boolean; spikeStyle: number };
    bodyType: LateJoinExpect;
    density: number;
    friction: number;
    shape?: 'box' | 'circle';
    hx?: number;
    hy?: number;
  }[] = [
    { name: 'crate', kind: HazardKind.Crate, bodyType: 'dynamic', density: 0.5, friction: 0.5 },
    { name: 'barrel', kind: HazardKind.Barrel, bodyType: 'dynamic', density: 0.5, friction: 0.5 },
    { name: 'debris', kind: HazardKind.Debris, bodyType: 'dynamic', density: 0.35, friction: 0.4 },
    { name: 'boss', kind: HazardKind.Boss, bodyType: 'dynamic', density: 1.2, friction: 0.4 },
    {
      name: 'spikeball swing',
      kind: HazardKind.Spikeball,
      bodyType: 'dynamic',
      density: 0.8,
      friction: 0.2,
      shape: 'circle',
    },
    {
      name: 'spikeball roll',
      kind: HazardKind.Spikeball,
      hz: { param0: 0.4, param1: 0, param2: 1, param3: 0 },
      flags: { isStatic: false, chainDeck: false, spikeStyle: 1 },
      bodyType: 'dynamic',
      density: 0.8,
      friction: 0.05,
      shape: 'circle',
    },
    {
      name: 'chain deck',
      kind: HazardKind.Chain,
      hz: { param0: 2.8, param1: 0.4, param2: 0, param3: 1 },
      flags: { isStatic: false, chainDeck: true, spikeStyle: 0 },
      bodyType: 'dynamic',
      density: 0.45,
      friction: 1.15,
    },
    {
      name: 'chain link',
      kind: HazardKind.Chain,
      bodyType: 'dynamic',
      density: 0.4,
      friction: 0.3,
    },
    {
      name: 'chain anchor',
      kind: HazardKind.Chain,
      flags: { isStatic: true, chainDeck: false, spikeStyle: 0 },
      bodyType: 'static',
      density: 0,
      friction: 0.4,
    },
    { name: 'momentum', kind: HazardKind.Momentum, bodyType: 'dynamic', density: 0.35, friction: 0.8 },
    { name: 'collapsing', kind: HazardKind.Collapsing, bodyType: 'dynamic', density: 0, friction: 0.8 },
    {
      name: 'moving platform',
      kind: HazardKind.MovingPlatform,
      hz: { param0: 3, param1: 5, param2: 1, param3: 0.6 },
      bodyType: 'kinematic',
      density: 0,
      friction: 0.8,
      hx: 2.5,
      hy: 0.3,
    },
    {
      name: 'rotating platform',
      kind: HazardKind.RotatingPlatform,
      hz: { param0: 1, param1: 4, param2: 0.6, param3: 0 },
      bodyType: 'kinematic',
      density: 0,
      friction: 0.8,
      hx: 2,
      hy: 0.3,
    },
    {
      name: 'disappearing platform',
      kind: HazardKind.Disappearing,
      hz: { param0: 140, param1: 0, param2: 3, param3: 0.5 },
      bodyType: 'kinematic',
      density: 0,
      friction: 0.8,
      hx: 1.5,
      hy: 0.25,
    },
  ];

  it('lists every mid-round dynamic Appendix D kind', () => {
    expect([...DYNAMIC_APPENDIX_D_KINDS].sort((a, b) => a - b)).toEqual(
      [
        HazardKind.Crate,
        HazardKind.Barrel,
        HazardKind.Debris,
        HazardKind.Spikeball,
        HazardKind.Boss,
        HazardKind.Chain,
        HazardKind.Momentum,
        HazardKind.Collapsing,
      ].sort((a, b) => a - b),
    );
  });

  it.each(cases)('$name is not a generic density-1 box', (row) => {
    const spec = lateJoinBodySpec(row.kind, row.hz ?? emptyHz, row.flags ?? liveFlags);
    expect(spec.bodyType).toBe(row.bodyType);
    expect(spec.density).toBeCloseTo(row.density, 5);
    expect(spec.friction).toBeCloseTo(row.friction, 5);
    if (row.shape) expect(spec.shape).toBe(row.shape);
    if (row.hx != null) {
      expect(spec.hx).toBeCloseTo(row.hx, 5);
      expect(spec.hy).toBeCloseTo(row.hy ?? 0, 5);
      expect(spec.hx).not.toBeCloseTo(1, 5);
      expect(spec.hy).not.toBeCloseTo(0.5, 5);
    }
    if (row.kind !== HazardKind.Boss) expect(spec.density).not.toBeCloseTo(1, 5);
    else expect(spec.density).not.toBeCloseTo(1, 5);
  });
});

describe('spawnMissing restores host hazard density/type', () => {
  function step(sim: SimHandle, n = 8): void {
    for (let i = 0; i < n; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
  }

  it.each([
    { name: 'crate', level: 'test-crate', kind: HazardKind.Crate },
    { name: 'barrel', level: 'test-barrel.explosive', kind: HazardKind.Barrel },
    { name: 'spikeball swing', level: 'test-spikeball', kind: HazardKind.Spikeball },
    { name: 'spikeball roll', level: 'test-spikeball-roll', kind: HazardKind.Spikeball },
    { name: 'spikeball drop', level: 'test-spikeball-drop', kind: HazardKind.Spikeball },
    { name: 'momentum', level: 'test-platform.momentum', kind: HazardKind.Momentum },
    { name: 'collapsing', level: 'test-platform.collapsing', kind: HazardKind.Collapsing },
    { name: 'boss', level: 'halloween-boss', kind: HazardKind.Boss },
  ])('$name spawnMissing matches host density/friction/type', ({ level, kind }) => {
    const host = makeSim({ level: getLevel(level), seed: 410 + kind, settings: { playerCount: 1 } });
    step(host);
    const rows = stealAndRestore(host, level, (hz) => hz.kind === kind);
    for (const row of rows) {
      expect(row.restored.type).toBe(row.host.type);
      expect(row.restored.density).toBeCloseTo(row.host.density, 5);
      expect(row.restored.friction).toBeCloseTo(row.host.friction, 5);
      expect(row.restored.circle).toBe(row.host.circle);
      expectNotGenericProp(row.restored, kind);
    }
  });

  it('chain deck / link / anchor each keep host type and density', () => {
    const host = makeSim({
      level: getLevel('test-chain'),
      seed: 430,
      settings: { playerCount: 1 },
    });
    step(host);
    const picks: { name: string; pick: (hz: { kind: number; param3: number }, e: Entity) => boolean }[] = [
      { name: 'deck', pick: (hz) => hz.kind === HazardKind.Chain && hz.param3 === 1 },
      {
        name: 'link',
        pick: (hz, e) => hz.kind === HazardKind.Chain && hz.param3 === 0 && !e.has(Static),
      },
      {
        name: 'anchor',
        pick: (hz, e) => hz.kind === HazardKind.Chain && e.has(Static),
      },
    ];
    for (const row of picks) {
      const again = makeSim({
        level: getLevel('test-chain'),
        seed: 430,
        settings: { playerCount: 1 },
      });
      step(again);
      const got = stealAndRestore(again, 'test-chain', row.pick);
      expect(got.length, row.name).toBeGreaterThan(0);
      for (const pair of got) {
        expect(pair.restored.type, row.name).toBe(pair.host.type);
        expect(pair.restored.density, row.name).toBeCloseTo(pair.host.density, 5);
        expect(pair.restored.friction, row.name).toBeCloseTo(pair.host.friction, 5);
        if (row.name !== 'anchor') expectNotGenericProp(pair.restored, HazardKind.Chain);
        else expect(pair.restored.type).toBe('static');
      }
    }
  });

  it('mid-round debris spawnMissing is density 0.35 dynamic, not a generic box', () => {
    const host = makeSim({
      level: getLevel('test-block.destructible'),
      seed: 440,
      settings: { playerCount: 1 },
    });
    host.ecs.query(Destructible, Hazard).updateEach(([d, hz]) => {
      if (hz.kind === HazardKind.Destructible) d.hp = 0;
    });
    step(host, 2);
    let debris = 0;
    host.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Debris) debris += 1;
    });
    expect(debris).toBeGreaterThanOrEqual(4);
    const snap = serializeWorld(host.ecs);
    const view = createClientView(snap, 120, getLevel('test-block.destructible'));
    const kill: Entity[] = [];
    view.sim.ecs.query(Hazard, NetId).updateEach(([hz], e) => {
      if (hz.kind === HazardKind.Debris) kill.push(e);
    });
    expect(kill.length).toBe(debris);
    for (const e of kill) {
      destroyBody(view.sim.ecs, e);
      e.destroy();
    }
    restoreWorld(view.sim.ecs, snap);
    const restored: BodyMaterial[] = [];
    view.sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Debris) return;
      restored.push(materialOf(view.sim, e));
    });
    expect(restored.length).toBe(debris);
    for (const row of restored) {
      expect(row.type).toBe('dynamic');
      expect(row.density).toBeCloseTo(0.35, 5);
      expect(row.friction).toBeCloseTo(0.4, 5);
      expect(row.density).not.toBeCloseTo(1, 5);
    }
  });

  it('M0 boxes the client never loaded are crate materials (density 0.5)', () => {
    const host = makeSim({ seed: 450, settings: { playerCount: 1 }, boxes: 3 });
    step(host);
    let crates = 0;
    host.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Crate) return;
      crates += 1;
      const m = materialOf(host, e);
      expect(m.density).toBeCloseTo(0.5, 5);
    });
    expect(crates).toBe(3);
    const snap = serializeWorld(host.ecs);
    const view = createClientView(snap, 120);
    const restored: BodyMaterial[] = [];
    view.sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Crate) return;
      restored.push(materialOf(view.sim, e));
    });
    expect(restored.length).toBe(3);
    for (const row of restored) {
      expect(row.type).toBe('dynamic');
      expect(row.density).toBeCloseTo(0.5, 5);
      expect(row.friction).toBeCloseTo(0.5, 5);
      expect(row.density).not.toBeCloseTo(1, 5);
    }
  });

  it.each([
    { name: 'moving', level: 'test-platform.moving', kind: HazardKind.MovingPlatform, hx: 2.5, hy: 0.3 },
    { name: 'rotating', level: 'test-platform.rotating', kind: HazardKind.RotatingPlatform, hx: 2, hy: 0.3 },
    { name: 'disappearing', level: 'test-platform.disappearing', kind: HazardKind.Disappearing, hx: 1.5, hy: 0.25 },
  ])('$name platform spawnMissing keeps host half-extents (not 1×0.5)', ({ level, kind, hx, hy }) => {
    const host = makeSim({ level: getLevel(level), seed: 470 + kind, settings: { playerCount: 1 } });
    const wanted: number[] = [];
    host.ecs.query(Hazard, NetId).updateEach(([hz, n], e) => {
      if (hz.kind !== kind) return;
      const ext = boxExtents(host, e);
      expect(ext.hx).toBeCloseTo(hx, 5);
      expect(ext.hy).toBeCloseTo(hy, 5);
      wanted.push(n.id);
    });
    expect(wanted.length).toBeGreaterThan(0);
    const snap = serializeWorld(host.ecs);
    const view = createClientView(snap, 120, getLevel(level));
    const kill: Entity[] = [];
    view.sim.ecs.query(Hazard, NetId).updateEach(([_hz, n], e) => {
      if (wanted.includes(n.id)) kill.push(e);
    });
    for (const e of kill) {
      destroyBody(view.sim.ecs, e);
      e.destroy();
    }
    restoreWorld(view.sim.ecs, snap);
    view.sim.ecs.query(Hazard, NetId).updateEach(([hz, n], e) => {
      if (hz.kind !== kind || !wanted.includes(n.id)) return;
      const ext = boxExtents(view.sim, e);
      expect(ext.hx).toBeCloseTo(hx, 5);
      expect(ext.hy).toBeCloseTo(hy, 5);
      expect(ext.hx).not.toBeCloseTo(1, 5);
      expect(view.sim.ctx.bodies.get(e)?.getType()).toBe('kinematic');
    });
  });

  it('spawnMissing rebuilds spikeball hang, chain revolutes, and momentum joints', () => {
    const cases: { level: string; kind: number; minJoints: number; pick: (hz: { kind: number; param2: number; param3: number }) => boolean }[] = [
      {
        level: 'test-spikeball',
        kind: HazardKind.Spikeball,
        minJoints: 1,
        pick: (hz) => hz.kind === HazardKind.Spikeball && hz.param2 === 0,
      },
      {
        level: 'test-chain',
        kind: HazardKind.Chain,
        minJoints: 1,
        pick: (hz) => hz.kind === HazardKind.Chain && hz.param3 !== 1,
      },
      {
        level: 'test-platform.momentum',
        kind: HazardKind.Momentum,
        minJoints: 1,
        pick: (hz) => hz.kind === HazardKind.Momentum,
      },
    ];
    for (const row of cases) {
      const host = makeSim({ level: getLevel(row.level), seed: 480 + row.kind, settings: { playerCount: 1 } });
      step(host);
      const nets: number[] = [];
      host.ecs.query(Hazard, NetId).updateEach(([hz, n], e) => {
        if (!row.pick(hz)) return;
        if (e.has(Static)) return;
        nets.push(n.id);
      });
      expect(nets.length, row.level).toBeGreaterThan(0);
      const snap = serializeWorld(host.ecs);
      const view = createClientView(snap, 120, getLevel(row.level));
      const kill: Entity[] = [];
      view.sim.ecs.query(Hazard, NetId).updateEach(([_hz, n], e) => {
        if (nets.includes(n.id)) kill.push(e);
      });
      for (const e of kill) {
        destroyBody(view.sim.ecs, e);
        e.destroy();
      }
      restoreWorld(view.sim.ecs, snap);
      let joined = 0;
      view.sim.ecs.query(Hazard, NetId).updateEach(([_hz, n], e) => {
        if (!nets.includes(n.id)) return;
        if (jointCount(view.sim.ctx.bodies.get(e)) >= row.minJoints) joined += 1;
      });
      expect(joined, row.level).toBe(nets.length);
      const after = { n: 0 };
      view.sim.ecs.query(Hazard, NetId).updateEach(([_hz, n], e) => {
        if (nets.includes(n.id)) after.n += jointCount(view.sim.ctx.bodies.get(e));
      });
      restoreWorld(view.sim.ecs, snap);
      let again = 0;
      view.sim.ecs.query(Hazard, NetId).updateEach(([_hz, n], e) => {
        if (nets.includes(n.id)) again += jointCount(view.sim.ctx.bodies.get(e));
      });
      expect(again, `${row.level} no dup joints`).toBe(after.n);
    }
  });

  it('Transform-only spawn points do not become density-1 boxes', () => {
    const host = makeSim({ seed: 490, settings: { playerCount: 1 } });
    const snap = serializeWorld(host.ecs);
    const view = createClientView(snap, 120);
    const kill: Entity[] = [];
    view.sim.ecs.query(SpawnPoint, NetId).updateEach((_, e) => kill.push(e));
    expect(kill.length).toBeGreaterThan(0);
    for (const e of kill) {
      destroyBody(view.sim.ecs, e);
      e.destroy();
    }
    restoreWorld(view.sim.ecs, snap);
    let boxed = 0;
    view.sim.ecs.query(PhysBody, NetId).updateEach((_, e) => {
      if (e.has(Hazard) || e.has(SpawnPoint)) return;
      const d = view.sim.ctx.bodies.get(e)?.getFixtureList()?.getDensity() ?? 0;
      if (Math.abs(d - 1) < 0.01) boxed += 1;
    });
    expect(boxed).toBe(0);
  });

  it('destructible / ice stay static with host friction after spawnMissing', () => {
    for (const { level, kind, friction } of [
      { level: 'test-block.destructible', kind: HazardKind.Destructible, friction: 0.5 },
      { level: 'test-ice', kind: HazardKind.Ice, friction: 0.02 },
    ]) {
      const host = makeSim({ level: getLevel(level), seed: 460 + kind, settings: { playerCount: 1 } });
      const rows = stealAndRestore(host, level, (hz) => hz.kind === kind);
      for (const row of rows) {
        expect(row.restored.type).toBe('static');
        expect(row.host.type).toBe('static');
        expect(row.restored.density).toBeCloseTo(0, 5);
        expect(row.restored.friction).toBeCloseTo(friction, 5);
        expect(row.restored.type).not.toBe('dynamic');
      }
    }
  });
});
