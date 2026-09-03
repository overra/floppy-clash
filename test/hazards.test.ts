import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { PRIM_CAPSULE, PRIM_DISK, PRIM_PIE, PRIM_TRIANGLE } from '../src/render/sdf/primitives';
import { APPENDIX_D_TYPE_IDS, HAZARDS_BY_TYPE, HAZARD_MODULES } from '../src/sim/hazards';
import {
  Controller,
  Dead,
  Destructible,
  Hazard,
  HazardKind,
  Health,
  PrevTransform,
  RagdollPart,
  Transform,
} from '../src/sim/traits';
import { crusherOverlaps } from '../src/sim/hazards/crusher';
import { diskSweepsPlayer } from '../src/sim/hazards/common';
import { sawOverlaps } from '../src/sim/hazards/saw';
import { hold, makeSim, pin, playerOf } from './helpers';

describe('M4 hazards', () => {
  it('spikes kill on contact that tick', () => {
    const sim = makeSim({ level: getLevel('test-spikes'), seed: 21, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const spikes = getLevel('test-spikes').objects.find((o) => o.type === 'spikes');
    p.set(Transform, { x: spikes?.x ?? 10, y: spikes?.y ?? 2.4, angle: 0 });
    sim.ctx.bodies.get(p)?.setPosition({ x: spikes?.x ?? 10, y: spikes?.y ?? 2.4 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('moving platform carries a standing player', () => {
    const sim = makeSim({
      level: getLevel('test-platform.moving'),
      seed: 22,
      settings: { playerCount: 1 },
    });
    const plat = { x: 16, y: 8 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.MovingPlatform) {
        plat.x = t.x;
        plat.y = t.y;
      }
    });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: plat.x, y: plat.y + 1.15 });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    p.set(Transform, { x: plat.x, y: plat.y + 1.15, angle: 0 });
    let grounded = false;
    for (let i = 0; i < 12; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (p.get(Controller)?.grounded) grounded = true;
    }
    expect(grounded).toBe(true);
    const x0 = p.get(Transform)?.x ?? 0;
    let platX0 = plat.x;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.MovingPlatform) platX0 = t.x;
    });
    for (let i = 0; i < 50; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let platX1 = platX0;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.MovingPlatform) platX1 = t.x;
    });
    const x1 = p.get(Transform)?.x ?? 0;
    expect(Math.abs(platX1 - platX0)).toBeGreaterThan(0.4);
    expect(Math.sign(x1 - x0)).toBe(Math.sign(platX1 - platX0) || Math.sign(x1 - x0));
    expect(Math.abs(x1 - x0)).toBeGreaterThan(0.25);
  });

  it('does not tunnel a player through a kinematic crusher in 60 Hz', () => {
    expect(crusherOverlaps(18, 8, 18, 8, 0.75, 3)).toBe(true);
    expect(crusherOverlaps(16.2, 8, 18, 8, 0.75, 3, 16.4, 8)).toBe(true);
    expect(crusherOverlaps(10, 3, 18, 8, 0.75, 3)).toBe(false);
    const sim = makeSim({
      level: getLevel('test-crusher'),
      seed: 24,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const obj = getLevel('test-crusher').objects.find((o) => o.type === 'crusher');
    sim.ctx.bodies.get(p)?.setPosition({ x: obj?.x ?? 18, y: obj?.y ?? 8 });
    p.set(Transform, { x: obj?.x ?? 18, y: obj?.y ?? 8, angle: 0 });
    for (let i = 0; i < 20; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0) break;
    }
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
    expect(Number.isFinite(p.get(Transform)?.x)).toBe(true);
  });

  it('does not tunnel a player through a translating crusher (PLAN M4 sweep)', () => {
    const level = {
      ...getLevel('test-crusher'),
      id: 'sweep-crusher-live',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'crusher' as const, x: 8, y: 5, w: 1.5, h: 2, period: 1, speed: 720 },
      ],
    };
    const sim = makeSim({ level, seed: 25, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    pin(sim, p, 14, 5);
    const hx = { n: 8 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crusher) hx.n = t.x;
    });
    expect(Math.abs(hx.n - 14)).toBeGreaterThan(2);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(false);
    pin(sim, p, 14, 5);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('does not tunnel a player through a fast spikeball (PLAN M4 sweep)', () => {
    expect(diskSweepsPlayer(14, 5, 20, 5, 0.75, 8, 5)).toBe(true);
    expect(diskSweepsPlayer(4, 2, 20, 5, 0.75, 8, 5)).toBe(false);
    const sim = makeSim({
      level: getLevel('test-spikeball-roll'),
      seed: 26,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t], e) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      e.set(Transform, { x: 8, y: 5, angle: 0 });
      e.set(PrevTransform, { x: 8, y: 5, angle: 0 });
      sim.ctx.bodies.get(e)?.setPosition({ x: 8, y: 5 });
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 720, y: 0 });
      t.x = 8;
      t.y = 5;
    });
    pin(sim, p, 14, 5);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('does not tunnel a player through a translating saw (PLAN M4 sweep)', () => {
    expect(sawOverlaps(16, 5, 16, 5, 0.7)).toBe(true);
    expect(sawOverlaps(10, 5, 18, 5, 0.7, 8, 5)).toBe(true);
    expect(sawOverlaps(4, 2, 18, 5, 0.7, 16, 5)).toBe(false);

    // Live: player sits on the segment the blade travels this tick, not on the current disk.
    const level = {
      ...getLevel('test-saw'),
      id: 'sweep-saw-live',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        {
          type: 'saw' as const,
          x: 8,
          y: 5,
          r: 0.45,
          speed: 720,
          mode: 'pingpong' as const,
          path: [
            { x: 8, y: 5 },
            { x: 20, y: 5 },
          ],
        },
      ],
    };
    const sim = makeSim({ level, seed: 24, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    pin(sim, p, 14, 5);
    const sawX = { n: 8 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Saw) sawX.n = t.x;
    });
    expect(Math.abs(sawX.n - 14)).toBeGreaterThan(2);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('spawn-centered saw wobble stays bounded (does not random-walk)', () => {
    const sim = makeSim({ level: getLevel('test-saw'), seed: 25, settings: { playerCount: 1 } });
    const xs: number[] = [];
    for (let i = 0; i < 200; i++) {
      sim.step();
      sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
        if (hz.kind === HazardKind.Saw) xs.push(t.x);
      });
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.4);
    expect(Math.max(...xs)).toBeLessThan(16 + 2.6);
    expect(Math.min(...xs)).toBeGreaterThan(16 - 2.6);
  });

  it('a saw with an authored path follows the waypoints (PLAN Appendix D)', () => {
    const sim = makeSim({
      level: getLevel('test-saw-path'),
      seed: 26,
      settings: { playerCount: 1 },
    });
    const xs: number[] = [];
    for (let i = 0; i < 160; i++) {
      sim.step();
      sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
        if (hz.kind === HazardKind.Saw) xs.push(t.x);
      });
    }
    expect(Math.min(...xs)).toBeLessThan(9);
    expect(Math.max(...xs)).toBeGreaterThan(19);
  });

  it('lava damages then respects cooldown', () => {
    const sim = makeSim({ level: getLevel('test-lava'), seed: 23, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const lava = getLevel('test-lava').objects.find((o) => o.type === 'lava');
    p.set(Transform, { x: lava?.x ?? 16, y: (lava?.y ?? 1.6) + 0.2, angle: 0 });
    sim.ctx.bodies.get(p)?.setPosition({ x: lava?.x ?? 16, y: (lava?.y ?? 1.6) + 0.2 });
    const before = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const mid = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = p.get(Health)?.hp ?? 100;
    expect(before - mid).toBe(35);
    expect(after).toBe(mid);
  });

  it('each hazard test level steps 60 ticks', () => {
    const kinds = [
      'saw',
      'crate',
      'ice',
      'conveyor',
      'bounce',
      'laser',
      'chain',
      'crusher',
      'barrel.explosive',
      'block.destructible',
      'platform.disappearing',
      'platform.collapsing',
      'platform.rotating',
      'platform.momentum',
      'spikeball',
    ];
    for (const kind of kinds) {
      const sim = makeSim({
        level: getLevel(`test-${kind}`),
        seed: 30,
        settings: { playerCount: 1 },
      });
      expect(() => {
        for (let i = 0; i < 60; i++) sim.step();
      }).not.toThrow();
    }
  });

  it('buildFrame uses triangle teeth for spikes and sdPie for saws', () => {
    const spikes = makeSim({
      level: getLevel('test-spikes'),
      seed: 21,
      settings: { playerCount: 1 },
    });
    const saw = makeSim({ level: getLevel('test-saw'), seed: 21, settings: { playerCount: 1 } });
    const spikeFrame = buildFrame(spikes, createCamera(spikes.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    const sawFrame = buildFrame(saw, createCamera(saw.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    expect(spikeFrame.groups.some((g) => g.primitives.some((p) => p.kind === PRIM_TRIANGLE))).toBe(
      true,
    );
    const sawPies = sawFrame.groups.flatMap((g) => g.primitives.filter((p) => p.kind === PRIM_PIE));
    expect(sawPies.length).toBeGreaterThanOrEqual(8);
    const angles = new Set(sawPies.map((p) => p.by.toFixed(3)));
    expect(angles.size).toBeGreaterThanOrEqual(8);
    const lava = makeSim({ level: getLevel('test-lava'), seed: 21, settings: { playerCount: 1 } });
    const lavaFrame = buildFrame(lava, createCamera(lava.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    expect(lavaFrame.groups.some((g) => g.fx === 'lava')).toBe(true);
  });

  it('damaged destructibles emit subtract-capsule cracks', () => {
    const sim = makeSim({
      level: getLevel('test-block.destructible'),
      seed: 21,
      settings: { playerCount: 1 },
    });
    sim.ecs.query(Destructible).updateEach(([d]) => {
      d.hp = d.maxHp * 0.25;
    });
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    const cracked = frame.groups.filter((g) => g.blend === 'subtract');
    expect(cracked.length).toBeGreaterThan(0);
    expect(cracked.some((g) => g.primitives.some((p) => p.kind === PRIM_CAPSULE))).toBe(true);
  });

  it('ragdoll primitives follow interpolated part angle', () => {
    const sim = makeSim({ seed: 210, settings: { playerCount: 1 } });
    playerOf(sim).set(Health, { hp: 0, maxHp: 100 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    let angled = false;
    sim.ecs.query(RagdollPart, Transform, PrevTransform).updateEach(([_r, t, prev]) => {
      t.angle = Math.PI / 2;
      prev.angle = Math.PI / 2;
      angled = true;
    });
    expect(angled).toBe(true);
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 1, 1280, 720, [], {
      freezeCamera: true,
    });
    const ragdoll = frame.groups.filter((g) => g.layer === 4);
    expect(ragdoll.some((g) => g.primitives.some((p) => p.kind === PRIM_DISK))).toBe(true);
    const cap = ragdoll.flatMap((g) => g.primitives).find((p) => p.kind === PRIM_CAPSULE);
    expect(cap).toBeTruthy();
    expect(Math.abs((cap?.ay ?? 0) - (cap?.by ?? 0))).toBeLessThan(0.08);
    expect(Math.abs((cap?.ax ?? 0) - (cap?.bx ?? 0))).toBeGreaterThan(0.15);
  });

  it('registers one module file per Appendix D type id', () => {
    for (const id of APPENDIX_D_TYPE_IDS) {
      expect(HAZARDS_BY_TYPE.get(id)?.typeId).toBe(id);
    }
    expect(HAZARD_MODULES.length).toBeGreaterThanOrEqual(APPENDIX_D_TYPE_IDS.length);
    expect(HAZARDS_BY_TYPE.get('boss')?.typeId).toBe('boss');
  });

  it('trigger.drop spawns the named weapon at atTick', () => {
    const sim = makeSim({
      level: getLevel('test-trigger.drop'),
      seed: 31,
      settings: { playerCount: 1 },
    });
    let spawned = false;
    for (let i = 0; i < 220; i++) {
      const ev = sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'spawn' && String(e.kind).includes('weapon'))) spawned = true;
    }
    expect(spawned).toBe(true);
  });
});
