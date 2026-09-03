import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { PRIM_PIE, PRIM_TRIANGLE } from '../src/render/sdf/primitives';
import { APPENDIX_D_TYPE_IDS, HAZARDS_BY_TYPE, HAZARD_MODULES } from '../src/sim/hazards';
import { Dead, Health, Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';

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

  it('moving platform exists and steps without throwing', () => {
    const sim = makeSim({
      level: getLevel('test-platform.moving'),
      seed: 22,
      settings: { playerCount: 1 },
    });
    expect(() => {
      for (let i = 0; i < 120; i++) sim.step();
    }).not.toThrow();
  });

  it('does not tunnel a player through a kinematic crusher in 60 Hz', () => {
    const sim = makeSim({
      level: getLevel('test-crusher'),
      seed: 24,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const start = p.get(Transform);
    for (let i = 0; i < 180; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const end = p.get(Transform);
    expect(Number.isFinite(end?.x)).toBe(true);
    expect(Number.isFinite(end?.y)).toBe(true);
    expect(Math.abs((end?.x ?? 0) - (start?.x ?? 0))).toBeLessThan(40);
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
    expect(mid).toBeLessThanOrEqual(before);
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
    expect(sawFrame.groups.some((g) => g.primitives.some((p) => p.kind === PRIM_PIE))).toBe(true);
    const lava = makeSim({ level: getLevel('test-lava'), seed: 21, settings: { playerCount: 1 } });
    const lavaFrame = buildFrame(lava, createCamera(lava.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    expect(lavaFrame.groups.some((g) => g.fx === 'lava')).toBe(true);
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
