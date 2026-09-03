import { describe, expect, it } from 'vitest';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Health, Held, HeldBy, Loose, Projectile, Snake, Transform, Weapon } from '../src/sim/traits';
import { WEAPON_BY_ID } from '../src/sim/weapons/defs';
import { explodeDamageAt, holdAmmoFromSeconds, rollIfRanged, rollRange } from '../src/sim/weapons/mapping';
import { hold, makeSim, playerOf } from './helpers';

function collectFiredDamages(weaponId: string, seeds: number[]): number[] {
  const out: number[] = [];
  for (const seed of seeds) {
    const sim = makeSim({ seed, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, weaponId, 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    sim.ecs.query(Projectile).updateEach(([proj]) => {
      out.push(proj.damage);
    });
  }
  return out;
}

function expectLiveRange(samples: number[], min: number, max: number, midpoint: number): void {
  expect(samples.length).toBeGreaterThan(4);
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(min);
  expect(Math.max(...samples)).toBeLessThanOrEqual(max);
  expect(samples.every((d) => d === midpoint)).toBe(false);
  expect(Math.min(...samples)).toBeLessThan(midpoint);
  expect(Math.max(...samples)).toBeGreaterThan(midpoint);
}

describe('PLAN Appendix C range / duration mapping', () => {
  it('holdAmmoFromSeconds matches accept language (10 s / ~5 s at 60 Hz)', () => {
    expect(holdAmmoFromSeconds(10, 2)).toBe(300);
    expect(holdAmmoFromSeconds(5, 2)).toBe(150);
    expect(WEAPON_BY_ID.get('lava-stream')?.def.ammo).toBe(300);
    expect(WEAPON_BY_ID.get('flamethrower')?.def.ammo).toBe(150);
  });

  it('explodeDamageAt maps GL 50–80 by distance like barrels', () => {
    expect(explodeDamageAt(1, { explodeDamageMin: 50, explodeDamageMax: 80, explodeDamage: 80, damage: 65 })).toBe(
      80,
    );
    expect(explodeDamageAt(0, { explodeDamageMin: 50, explodeDamageMax: 80, explodeDamage: 80, damage: 65 })).toBe(
      50,
    );
    expect(explodeDamageAt(0.5, { explodeDamageMin: 50, explodeDamageMax: 80, explodeDamage: 80, damage: 65 })).toBe(
      65,
    );
  });

  it('rollIfRanged does not consume a silent midpoint when a range is set', () => {
    let i = 0;
    const rng = { next: () => [0, 0.5, 0.999][i++] ?? 0 };
    expect(rollIfRanged(rng, 10, 30, 18)).toBe(10);
    expect(rollIfRanged(rng, 10, 30, 18)).toBe(20);
    expect(rollRange({ next: () => 0.999 }, 10, 30)).toBeCloseTo(29.98, 2);
    expect(rollIfRanged({ next: () => 0.5 }, undefined, undefined, 18)).toBe(18);
  });

  it('sawed-off pellets roll 10–30, not a pinned 18', () => {
    const samples = collectFiredDamages(
      'sawed-off',
      Array.from({ length: 16 }, (_, i) => 200 + i),
    );
    expectLiveRange(samples, 10, 30, 20);
    expect(samples.length).toBe(16 * 5);
  });

  it('military shotgun pellets roll 5–6', () => {
    const samples = collectFiredDamages(
      'military-shotgun',
      Array.from({ length: 16 }, (_, i) => 220 + i),
    );
    expectLiveRange(samples, 5, 6, 5.5);
  });

  it('lava spray droplets roll 5–20', () => {
    const samples = collectFiredDamages(
      'lava-spray',
      Array.from({ length: 20 }, (_, i) => 240 + i),
    );
    expectLiveRange(samples, 5, 20, 12.5);
  });

  it('blink dagger rolls 22–50', () => {
    const samples: number[] = [];
    for (let seed = 260; seed < 284; seed++) {
      const sim = makeSim({ seed, settings: { playerCount: 2 } });
      const a = playerOf(sim, 0);
      const b = playerOf(sim, 1);
      sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
      sim.ctx.bodies.get(b)?.setPosition({ x: 14, y: 4 });
      a.set(Transform, { x: 10, y: 4, angle: 0 });
      b.set(Transform, { x: 14, y: 4, angle: 0 });
      const gun = spawnWeapon(sim.ecs, 'blink-dagger', 10, 5);
      gun.add(Held(), HeldBy(a));
      gun.remove(Loose);
      for (let i = 0; i < 8; i++) {
        const ev = sim.step([
          hold({ attack: i === 1, aimX: 1, aimY: 0 }),
          hold({}),
          hold({}),
          hold({}),
        ]);
        const hit = ev.find((e) => e.type === 'hit');
        if (hit && hit.type === 'hit') samples.push(hit.damage);
      }
    }
    expectLiveRange(samples, 22, 50, 36);
  });

  it('god pistol rolls 30–60 (shared mapping, not a special case)', () => {
    const samples = collectFiredDamages(
      'god-pistol',
      Array.from({ length: 20 }, (_, i) => 280 + i),
    );
    expectLiveRange(samples, 30, 60, 45);
  });

  it('grenade launcher explosion is 50–80 by distance, not a flat 65', () => {
    const sim = makeSim({ seed: 301, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10.15, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12.15, y: 4 });
    a.set(Transform, { x: 10.15, y: 4, angle: 0 });
    b.set(Transform, { x: 12.15, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'grenade-launcher', 8, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    sim.ecs.query(Projectile).updateEach(([p], e) => {
      p.fuse = 1;
      p.x = 10;
      p.y = 4;
      p.vx = 0;
      p.vy = 0;
      sim.ctx.bodies.get(e)?.setPosition({ x: 10, y: 4 });
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
    });
    const hpA = a.get(Health)?.hp ?? 100;
    const hpB = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 4; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const near = hpA - (a.get(Health)?.hp ?? 100);
    const far = hpB - (b.get(Health)?.hp ?? 100);
    expect(near).toBeGreaterThanOrEqual(50);
    expect(near).toBeLessThanOrEqual(80);
    expect(far).toBeGreaterThanOrEqual(50);
    expect(far).toBeLessThanOrEqual(80);
    expect(near).toBeGreaterThan(far);
    expect(near).not.toBe(65);
    expect(far).not.toBe(65);
  });

  it('lava stream empties after 10 s of hold fire and deals ~60/s', () => {
    const sim = makeSim({ seed: 310, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 14, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 14, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'lava-stream', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    expect(gun.get(Weapon)?.ammo).toBe(300);
    let beamHits = 0;
    const hp0 = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 60; i++) {
      sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
      sim.ctx.bodies.get(b)?.setPosition({ x: 14, y: 4 });
      sim.ctx.bodies.get(a)?.setLinearVelocity({ x: 0, y: 0 });
      sim.ctx.bodies.get(b)?.setLinearVelocity({ x: 0, y: 0 });
      a.set(Transform, { x: 10, y: 4, angle: 0 });
      b.set(Transform, { x: 14, y: 4, angle: 0 });
      const ev = sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      beamHits += ev.filter((e) => e.type === 'hit').reduce((s, e) => s + (e.type === 'hit' ? e.damage : 0), 0);
    }
    expect(gun.get(Weapon)?.ammo).toBe(270);
    expect(beamHits).toBeGreaterThanOrEqual(50);
    expect(beamHits).toBeLessThanOrEqual(70);
    expect((b.get(Health)?.hp ?? 100) < hp0).toBe(true);

    const drain = makeSim({ seed: 311, settings: { playerCount: 1 } });
    const p = playerOf(drain);
    const hose = spawnWeapon(drain.ecs, 'lava-stream', 8, 6);
    hose.add(Held(), HeldBy(p));
    hose.remove(Loose);
    for (let i = 0; i < 600; i++) {
      drain.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(hose.get(Weapon)?.ammo).toBe(0);
    drain.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(hose.has(Loose) || (hose.get(Weapon)?.ammo ?? 1) <= 0).toBe(true);
  });

  it('flamethrower empties after ~5 s of hold fire', () => {
    const sim = makeSim({ seed: 312, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'flamethrower', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    expect(gun.get(Weapon)?.ammo).toBe(150);
    for (let i = 0; i < 300; i++) {
      sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(gun.get(Weapon)?.ammo).toBe(0);
  });

  it('M16 ammo counts 30 bursts (one trigger = 3 shots, 1 ammo)', () => {
    const sim = makeSim({ seed: 313, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'm16', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    expect(gun.get(Weapon)?.ammo).toBe(30);
    let shots = 0;
    for (let i = 0; i < 16; i++) {
      const ev = sim.step([
        hold({ attack: i === 0, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
      shots += ev.filter((e) => e.type === 'shot').length;
    }
    expect(shots).toBe(3);
    expect(gun.get(Weapon)?.ammo).toBe(29);
  });

  it('snake shotgun fires 3 snakes per shot', () => {
    const sim = makeSim({ seed: 314, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'snake-shotgun', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    for (let i = 0; i < 8; i++) {
      sim.step([hold({ attack: i === 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    let snakes = 0;
    sim.ecs.query(Snake).updateEach(() => {
      snakes += 1;
    });
    expect(snakes).toBe(3);
  });

  it('lava spike ball fragments roll 20–40, not a hardcoded 10', () => {
    const samples: number[] = [];
    for (let seed = 320; seed < 328; seed++) {
      const sim = makeSim({ seed, settings: { playerCount: 1 } });
      const p = playerOf(sim);
      const gun = spawnWeapon(sim.ecs, 'lava-spike-ball', 8, 6);
      gun.add(Held(), HeldBy(p));
      gun.remove(Loose);
      sim.step([hold({ attack: true, aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
      sim.ecs.query(Projectile).updateEach(([proj]) => {
        proj.fuse = 1;
      });
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      sim.ecs.query(Projectile).updateEach(([proj]) => {
        samples.push(proj.damage);
      });
    }
    expectLiveRange(samples, 20, 40, 30);
    expect(samples.length).toBeGreaterThanOrEqual(25);
  });

  it('lava spike gun impact is 10–15 and fragments are 5–10', () => {
    const spikes: number[] = [];
    const shots: number[] = [];
    for (let seed = 330; seed < 340; seed++) {
      const sim = makeSim({ seed, settings: { playerCount: 1 } });
      const p = playerOf(sim);
      const gun = spawnWeapon(sim.ecs, 'lava-spike-gun', 8, 6);
      gun.add(Held(), HeldBy(p));
      gun.remove(Loose);
      sim.step([hold({ attack: true, aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
      sim.ecs.query(Projectile).updateEach(([proj]) => {
        shots.push(proj.damage);
        proj.fuse = 1;
      });
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      sim.ecs.query(Projectile).updateEach(([proj]) => {
        spikes.push(proj.damage);
      });
    }
    expect(shots.length).toBeGreaterThan(0);
    expect(Math.min(...shots)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...shots)).toBeLessThanOrEqual(15);
    expect(shots.every((d) => d === 12.5)).toBe(false);
    expectLiveRange(spikes, 5, 10, 7.5);
  });

  it('bouncer bullets start at 6 bounces and decrement on a wall hit', () => {
    expect(WEAPON_BY_ID.get('bouncer')!.projectile.bounce).toBe(6);
    const sim = makeSim({ seed: 350, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    // Gym climb-shaft walls sit at x≈2.5/5.5; stand in open air so the fire tick
    // does not consume a bounce before we can read the catalog start value.
    sim.ctx.bodies.get(p)?.setPosition({ x: 16, y: 4 });
    p.set(Transform, { x: 16, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'bouncer', 16, 5);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: -1, aimY: 0 }), hold({}), hold({}), hold({})]);
    let start = -1;
    sim.ecs.query(Projectile).updateEach(([proj]) => {
      start = proj.bounces;
    });
    expect(start).toBe(6);
    let after = start;
    for (let i = 0; i < 40; i++) {
      sim.step([hold({ aimX: -1, aimY: 0 }), hold({}), hold({}), hold({})]);
      sim.ecs.query(Projectile).updateEach(([proj]) => {
        after = proj.bounces;
      });
      if (after < start) break;
    }
    expect(after).toBeLessThan(start);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  it('snake grenade bursts into 4 snakes (Appendix C)', () => {
    const sim = makeSim({ seed: 351, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'snake-grenade', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
    sim.ecs.query(Projectile).updateEach(([proj]) => {
      proj.fuse = 1;
    });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    let snakes = 0;
    sim.ecs.query(Snake).updateEach(() => {
      snakes += 1;
    });
    expect(snakes).toBe(4);
  });

  it('RPG 300+ deals at least 300 on a blast', () => {
    const sim = makeSim({ seed: 340, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 8, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 10.05, y: 4 });
    a.set(Transform, { x: 8, y: 4, angle: 0 });
    b.set(Transform, { x: 10.05, y: 4, angle: 0 });
    b.set(Health, { hp: 400, maxHp: 400 });
    const gun = spawnWeapon(sim.ecs, 'rpg', 8, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
    sim.ecs.query(Projectile).updateEach(([p], e) => {
      p.x = 10;
      p.y = 4;
      p.vx = 0;
      p.vy = 0;
      p.fuse = 1;
      sim.ctx.bodies.get(e)?.setPosition({ x: 10, y: 4 });
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
    });
    const hp0 = b.get(Health)?.hp ?? 400;
    for (let i = 0; i < 4; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const lost = hp0 - (b.get(Health)?.hp ?? 0);
    expect(lost).toBeGreaterThanOrEqual(300);
  });
});
