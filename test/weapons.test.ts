import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Combat, Dead, Health, Held, HeldBy, Loose, Player, PrevTransform, Transform, Weapon } from '../src/sim/traits';
import { weaponIndex } from '../src/sim/weapons/defs';
import { damageMultiplier, takeDamage } from '../src/sim/player/health';
import { applyExplosion } from '../src/sim/physics/queries';
import { playerCrossesBeam } from '../src/sim/hazards/laser';
import type { FixtureUserData } from '../src/sim/physics/categories';
import type { Entity } from 'koota';
import { hold, makeSim, pin, playerOf } from './helpers';

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
    expect(gun.has(Held)).toBe(true);
    expect(gun.targetFor(HeldBy)).toBe(p);
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
    sim.ctx.bodies.get(a)?.setPosition({ x: 10.4, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 13.2, y: 4 });
    a.set(Transform, { x: 10.4, y: 4, angle: 0 });
    b.set(Transform, { x: 13.2, y: 4, angle: 0 });
    const hpA = a.get(Health)?.hp ?? 100;
    const hpB = b.get(Health)?.hp ?? 100;
    applyExplosion(sim.ecs, 10, 4, 4, 0, (body, falloff) => {
      const data = body.getUserData() as FixtureUserData | undefined;
      const target = data?.entity as Entity | undefined;
      if (!target || !sim.ecs.has(target) || !target.has(Player) || target.has(Dead)) return;
      takeDamage(sim.ecs, target, 80 * falloff, 'body', -1, 10, 4);
    });
    const nearLost = hpA - (a.get(Health)?.hp ?? 100);
    const farLost = hpB - (b.get(Health)?.hp ?? 100);
    expect(nearLost).toBeGreaterThan(farLost);
    expect(farLost).toBeGreaterThan(0);
    expect(nearLost).toBeLessThan(80);
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
    const lost = before - (b.get(Health)?.hp ?? 100);
    expect(gun.get(Weapon)?.thrownHit).toBe(true);
    expect(lost).toBe(55);

    const blocked = makeSim({ level: woodsClearing, seed: 19, settings: { playerCount: 2 } });
    const ba = playerOf(blocked, 0);
    const bb = playerOf(blocked, 1);
    blocked.ctx.bodies.get(ba)?.setPosition({ x: 10, y: 4 });
    blocked.ctx.bodies.get(bb)?.setPosition({ x: 11.1, y: 4 });
    ba.set(Transform, { x: 10, y: 4, angle: 0 });
    bb.set(Transform, { x: 11.1, y: 4, angle: 0 });
    const tossed = spawnWeapon(blocked.ecs, 'pistol', 10, 5);
    tossed.add(Held(), HeldBy(ba));
    tossed.remove(Loose);
    const hp0 = bb.get(Health)?.hp ?? 100;
    let bounce = false;
    for (let i = 0; i < 16; i++) {
      const ev = blocked.step([
        hold({ throw: i === 2, aimX: 1, aimY: 0 }),
        hold({ block: true, aimX: -1, aimY: 0 }),
        hold({}),
        hold({}),
      ]);
      if (ev.some((e) => e.type === 'block')) bounce = true;
    }
    expect(bounce).toBe(true);
    expect(bb.get(Health)?.hp ?? 100).toBe(hp0);
  });

  it('does not tunnel a player through an on lava-stream in one tick (PLAN M6 sweep)', () => {
    expect(playerCrossesBeam(14, 1, 14, 8, 10, 4, 50, 4)).toBeTruthy();
    expect(playerCrossesBeam(14, 1, 14, 2, 10, 4, 50, 4)).toBeNull();

    const sim = makeSim({ level: woodsClearing, seed: 21, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    const gun = spawnWeapon(sim.ecs, 'lava-stream', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    pin(sim, a, 10, 4);
    pin(sim, b, 14, 1);
    b.set(PrevTransform, { x: 14, y: 1, angle: 0 });
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(b.has(Dead) || (b.get(Health)?.hp ?? 100) < 100).toBe(false);
    pin(sim, a, 10, 4);
    pin(sim, b, 14, 8);
    b.set(PrevTransform, { x: 14, y: 1, angle: 0 });
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(b.has(Dead) || (b.get(Health)?.hp ?? 100) < 100).toBe(true);
  });
});

