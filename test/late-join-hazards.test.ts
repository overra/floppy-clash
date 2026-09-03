import { describe, expect, it } from 'vitest';
import type { Entity } from 'koota';
import { Circle } from 'planck';
import { createClientView } from '../src/net/clientView';
import { getLevel } from '../src/levels/catalog';
import { DYNAMIC_APPENDIX_D_KINDS, lateJoinBodySpec } from '../src/sim/hazards/lateJoin';
import { destroyBody } from '../src/sim/physics/bodies';
import { restoreWorld, serializeWorld } from '../src/sim/snapshot';
import { Destructible, Hazard, HazardKind, NetId, Static } from '../src/sim/traits';
import { hold, makeSim } from './helpers';
import type { SimHandle } from '../src/sim/world';

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
      friction: 0.6,
    },
    { name: 'momentum', kind: HazardKind.Momentum, bodyType: 'dynamic', density: 0.35, friction: 0.8 },
    { name: 'collapsing', kind: HazardKind.Collapsing, bodyType: 'dynamic', density: 0, friction: 0.8 },
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
