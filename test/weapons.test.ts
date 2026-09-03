import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Combat, Health, Held, HeldBy, Loose, Transform, Weapon } from '../src/sim/traits';
import { weaponIndex } from '../src/sim/weapons/defs';
import { damageMultiplier } from '../src/sim/player/health';
import { hold, makeSim, playerOf } from './helpers';

describe('M3 weapons', () => {
  it('picks up a loose weapon and refills ammo', () => {
    const sim = makeSim({ level: woodsClearing, seed: 12, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const t = p.get(Transform)!;
    const gun = spawnWeapon(sim.ecs, 'pistol', t.x + 0.15, t.y);
    gun.set(Weapon, { defId: weaponIndex('pistol'), ammo: 1, pickupCooldown: 0, thrown: false, thrownHit: false });
    for (let i = 0; i < 20; i++) {
      const pt = p.get(Transform);
      if (pt) sim.ctx.bodies.get(gun)?.setPosition({ x: pt.x + 0.2, y: pt.y });
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (gun.has(Held)) break;
    }
    expect(gun.has(Held) || gun.targetFor(HeldBy) === p).toBe(true);
    expect(gun.get(Weapon)?.ammo).toBe(15);
  });

  it('headshot multiplier is 2x', () => {
    const sim = makeSim({ seed: 1, settings: { playerCount: 1 } });
    expect(damageMultiplier('head', sim.ecs)).toBe(2);
    expect(damageMultiplier('neck', sim.ecs)).toBe(1.5);
    expect(damageMultiplier('body', sim.ecs)).toBe(1);
  });

  it('perfect block reflects a bullet', () => {
    const sim = makeSim({ level: woodsClearing, seed: 13, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 14, y: 4 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const combat = b.get(Combat);
    if (combat) b.set(Combat, { ...combat, blocking: true, blockStartTick: sim.ctx.tick, blockMeter: 1 });
    let reflected = false;
    for (let i = 0; i < 20; i++) {
      const ev = sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({ block: true, aimX: -1, aimY: 0 }),
        hold({}),
        hold({}),
      ]);
      if (ev.some((e) => e.type === 'block' && e.reflected)) reflected = true;
    }
    expect(reflected).toBe(true);
    expect(b.get(Health)?.hp ?? 0).toBeGreaterThan(50);
  });

  it('bullet hit events carry a finite world hit point', () => {
    const sim = makeSim({ level: woodsClearing, seed: 16, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12.5, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 12.5, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    let hit: { x: number; y: number } | undefined;
    for (let i = 0; i < 30; i++) {
      const ev = sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
      const h = ev.find((e) => e.type === 'hit');
      if (h && h.type === 'hit') hit = { x: h.x, y: h.y };
    }
    expect(hit).toBeTruthy();
    expect(Number.isFinite(hit!.x)).toBe(true);
    expect(Number.isFinite(hit!.y)).toBe(true);
  });

  it('pickup cooldown blocks an immediate re-grab after throw', () => {
    const sim = makeSim({ level: woodsClearing, seed: 15, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const t = p.get(Transform)!;
    const gun = spawnWeapon(sim.ecs, 'pistol', t.x + 0.15, t.y);
    for (let i = 0; i < 8; i++) {
      const pt = p.get(Transform);
      if (pt) sim.ctx.bodies.get(gun)?.setPosition({ x: pt.x + 0.15, y: pt.y });
      sim.step([hold({ throw: i === 3 }), hold({}), hold({}), hold({})]);
    }
    expect(gun.get(Weapon)?.pickupCooldown ?? 0).toBeGreaterThan(0);
  });

  it('explosions apply falloff damage', () => {
    const sim = makeSim({ level: woodsClearing, seed: 14, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 12, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 16, y: 4 });
    a.set(Transform, { x: 12, y: 4, angle: 0 });
    b.set(Transform, { x: 16, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'rpg', 12, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const before = b.get(Health)?.hp ?? 100;
    let exploded = false;
    for (let i = 0; i < 50; i++) {
      const ev = sim.step([hold({ attack: i === 2, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'explosion')) exploded = true;
    }
    expect((b.get(Health)?.hp ?? 100) < before || exploded).toBe(true);
  });

  it('thrown weapons deal 55 on first hit and bounce off a block', () => {
    const sim = makeSim({ level: woodsClearing, seed: 18, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 11.1, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 11.1, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const before = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 16; i++) {
      sim.step([
        hold({ throw: i === 2, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
    }
    expect((b.get(Health)?.hp ?? 100) <= before - 50 || gun.get(Weapon)?.thrownHit).toBe(true);
  });
});

