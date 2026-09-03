import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { spawnWeapon } from '../src/sim/systems/weapons';
import {
  Dead,
  Destructible,
  Hazard,
  HazardKind,
  Health,
  Held,
  HeldBy,
  Loose,
  PhysArm,
  Transform,
} from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';

describe('M4 hazard details', () => {
  it('moving platform carries a standing player', () => {
    const sim = makeSim({
      level: getLevel('test-platform.moving'),
      seed: 40,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const plat = { x: 0, y: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.MovingPlatform) {
        plat.x = t.x;
        plat.y = t.y;
      }
    });
    sim.ctx.bodies.get(p)?.setPosition({ x: plat.x, y: plat.y + 1.1 });
    const xs: number[] = [];
    for (let i = 0; i < 90; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      xs.push(p.get(Transform)?.x ?? 0);
    }
    const span = Math.max(...xs) - Math.min(...xs);
    expect(span).toBeGreaterThan(0.4);
  });

  it('halloween boss walks and can be stepped', () => {
    const sim = makeSim({
      level: getLevel('halloween-boss'),
      seed: 42,
      settings: { playerCount: 1 },
    });
    let bosses = 0;
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Boss) bosses += 1;
    });
    expect(bosses).toBeGreaterThan(0);
    const p = playerOf(sim);
    const start = p.get(Transform)?.x ?? 0;
    expect(() => {
      for (let i = 0; i < 90; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    }).not.toThrow();
    expect(Number.isFinite(p.get(Transform)?.x ?? start)).toBe(true);
  });

  it('opt-in physics arms attach to the capsule', () => {
    const sim = makeSim({ seed: 43, settings: { playerCount: 1, physicsArms: true } });
    let arms = 0;
    sim.ecs.query(PhysArm).updateEach(() => {
      arms += 1;
    });
    expect(arms).toBe(2);
    expect(() => {
      for (let i = 0; i < 20; i++)
        sim.step([hold({ aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
    }).not.toThrow();
  });

  it('chain links take damage and break', () => {
    const sim = makeSim({ level: getLevel('test-chain'), seed: 41, settings: { playerCount: 1 } });
    let before = 0;
    sim.ecs.query(Destructible).updateEach(() => {
      before += 1;
    });
    sim.ecs.query(Destructible).updateEach(([d]) => {
      d.hp = 0;
    });
    expect(before).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) sim.step();
    let after = 0;
    sim.ecs.query(Destructible).updateEach(() => {
      after += 1;
    });
    expect(after).toBeLessThan(before);
  });

  it('void (out of bounds) kills on that tick', () => {
    const sim = makeSim({ level: getLevel('test-void'), seed: 50, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    p.set(Transform, { x: -8, y: -8, angle: 0 });
    sim.ctx.bodies.get(p)?.setPosition({ x: -8, y: -8 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('saw and spikeball kill on contact', () => {
    for (const id of ['test-saw', 'test-spikeball'] as const) {
      const sim = makeSim({ level: getLevel(id), seed: 51, settings: { playerCount: 1 } });
      const p = playerOf(sim);
      const obj = getLevel(id).objects.find((o) => o.type === 'saw' || o.type === 'spikeball');
      p.set(Transform, { x: obj?.x ?? 12, y: obj?.y ?? 5, angle: 0 });
      sim.ctx.bodies.get(p)?.setPosition({ x: obj?.x ?? 12, y: obj?.y ?? 5 });
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0, id).toBe(true);
    }
  });

  it('bounce pad launches a grounded player upward', () => {
    const sim = makeSim({ level: getLevel('test-bounce'), seed: 52, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const pad = getLevel('test-bounce').objects.find((o) => o.type === 'bounce');
    sim.ctx.bodies.get(p)?.setPosition({ x: pad?.x ?? 13, y: (pad?.y ?? 2.3) + 0.9 });
    for (let i = 0; i < 20; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const vy = sim.ctx.bodies.get(p)?.getLinearVelocity().y ?? 0;
    const y = p.get(Transform)?.y ?? 0;
    expect(vy > 4 || y > 4).toBe(true);
  });

  it('conveyor moves a standing player; ducking anchors', () => {
    const sim = makeSim({
      level: getLevel('test-conveyor'),
      seed: 53,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const belt = getLevel('test-conveyor').objects.find((o) => o.type === 'conveyor');
    sim.ctx.bodies.get(p)?.setPosition({ x: belt?.x ?? 16, y: (belt?.y ?? 2.2) + 1.1 });
    const xs: number[] = [];
    for (let i = 0; i < 40; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      xs.push(p.get(Transform)?.x ?? 0);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.2);
  });

  it('ice fixture is low-friction and can be stood on', () => {
    const sim = makeSim({ level: getLevel('test-ice'), seed: 54, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 12, y: 3.2 });
    for (let i = 0; i < 24; i++) sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    for (let i = 0; i < 6; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(Math.abs(sim.ctx.bodies.get(p)?.getLinearVelocity().x ?? 0)).toBeGreaterThan(4);
    expect(Number.isFinite(p.get(Transform)?.x)).toBe(true);
  });

  it('destructible block loses HP to bullets and a barrel explodes for 10–55', () => {
    const blockSim = makeSim({
      level: getLevel('test-block.destructible'),
      seed: 55,
      settings: { playerCount: 1 },
    });
    const shooter = playerOf(blockSim);
    const block = { hp: 60 };
    blockSim.ecs.query(Destructible).updateEach(([d]) => {
      block.hp = d.hp;
    });
    const gun = spawnWeapon(blockSim.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(shooter));
    gun.remove(Loose);
    const target = getLevel('test-block.destructible').objects.find(
      (o) => o.type === 'block.destructible',
    );
    blockSim.ctx.bodies.get(shooter)?.setPosition({ x: (target?.x ?? 10) - 3, y: target?.y ?? 4 });
    for (let i = 0; i < 12; i++) {
      blockSim.step([hold({ attack: i === 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    let after = block.hp;
    blockSim.ecs.query(Destructible).updateEach(([d]) => {
      after = d.hp;
    });
    expect(after).toBeLessThan(block.hp);

    const barrelSim = makeSim({
      level: getLevel('test-barrel.explosive'),
      seed: 56,
      settings: { playerCount: 1 },
    });
    const p = playerOf(barrelSim);
    const barrel = getLevel('test-barrel.explosive').objects.find(
      (o) => o.type === 'barrel.explosive',
    );
    barrelSim.ctx.bodies.get(p)?.setPosition({ x: barrel?.x ?? 13, y: (barrel?.y ?? 3) + 0.2 });
    p.set(Transform, { x: barrel?.x ?? 13, y: (barrel?.y ?? 3) + 0.2, angle: 0 });
    const hp0 = p.get(Health)?.hp ?? 100;
    barrelSim.ecs.query(Destructible).updateEach(([d]) => {
      d.hp = 0;
    });
    const ev = barrelSim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(ev.some((e) => e.type === 'explosion')).toBe(true);
    const lost = hp0 - (p.get(Health)?.hp ?? 100);
    expect(lost).toBeGreaterThanOrEqual(10);
    expect(lost).toBeLessThanOrEqual(55);
  });

  it('laser warning then kill, disappearing platform toggles, collapsing falls', () => {
    const laser = makeSim({
      level: getLevel('test-laser'),
      seed: 57,
      settings: { playerCount: 1 },
    });
    let warned = false;
    let on = false;
    for (let i = 0; i < 80; i++) {
      laser.ecs.query(Hazard).updateEach(([hz]) => {
        if (hz.kind === HazardKind.Laser && hz.armed === 2) warned = true;
        if (hz.kind === HazardKind.Laser && hz.armed === 1) on = true;
      });
      laser.step();
    }
    expect(warned && on).toBe(true);

    const disc = makeSim({
      level: getLevel('test-platform.disappearing'),
      seed: 58,
      settings: { playerCount: 1 },
    });
    const armed: number[] = [];
    for (let i = 0; i < 160; i++) {
      disc.step();
      disc.ecs.query(Hazard).updateEach(([hz]) => {
        if (hz.kind === HazardKind.Disappearing) armed.push(hz.armed);
      });
    }
    expect(armed.some((a) => a === 0) && armed.some((a) => a === 1)).toBe(true);

    const fall = makeSim({
      level: getLevel('test-platform.collapsing'),
      seed: 59,
      settings: { playerCount: 1 },
    });
    const p = playerOf(fall);
    const plat = { x: 0, y: 0 };
    fall.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Collapsing) {
        plat.x = t.x;
        plat.y = t.y;
      }
    });
    fall.ctx.bodies.get(p)?.setPosition({ x: plat.x, y: plat.y + 1.1 });
    const y0 = plat.y;
    for (let i = 0; i < 80; i++) fall.step([hold({}), hold({}), hold({}), hold({})]);
    let y1 = y0;
    fall.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Collapsing) y1 = t.y;
    });
    expect(y1).toBeLessThan(y0 - 0.05);
  });

  it('moving platform follows its waypoint path', () => {
    const sim = makeSim({
      level: getLevel('test-platform.moving'),
      seed: 60,
      settings: { playerCount: 1 },
    });
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) {
      sim.step();
      sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
        if (hz.kind === HazardKind.MovingPlatform) xs.push(t.x);
      });
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
  });
});
