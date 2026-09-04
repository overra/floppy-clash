import type { Entity } from 'koota';
import { describe, expect, it } from 'vitest';
import { REPULSOR_TICKS } from '../src/sim/hazards';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Combat, Hazard, HazardKind, Health, Held, HeldBy, Lifetime, Loose, Snake, Status, Transform, Weapon } from '../src/sim/traits';
import { CHARGE_MAX_TICKS } from '../src/sim/weapons/systems';
import { hold, makeSim, playerOf, runTrack, stepMany } from './helpers';

/** Two fighters on the flat run track, `gap` metres apart, A armed with `weaponId`. */
function duel(weaponId: string, gap: number, settings: Record<string, unknown> = {}) {
  const sim = makeSim({ level: runTrack, seed: 50, settings: { playerCount: 2, items: 'off', ...settings } });
  const a = playerOf(sim, 0);
  const b = playerOf(sim, 1);
  sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
  sim.ctx.bodies.get(b)?.setPosition({ x: 20 + gap, y: 2.81 });
  sim.step([hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
  const gun = spawnWeapon(sim.ecs, weaponId, 20, 2.81, false);
  gun.add(Held(), HeldBy(a));
  return { sim, a, b, gun };
}

const idle = hold({ aimX: -1, aimY: 0 });

describe('Slugger', () => {
  /** A holds attack for `heldTicks`, lets go, and the sim runs on; returns B's launch and the swing count. */
  function swing(heldTicks: number, run = 40) {
    const { sim, b, gun } = duel('slugger', 1.0);
    let launched = 0;
    let swings = 0;
    let peakCharge = 0;
    for (let i = 0; i < run; i++) {
      const ev = sim.step([hold({ attack: i < heldTicks, aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
      peakCharge = Math.max(peakCharge, gun.get(Weapon)?.charge ?? 0);
      swings += ev.filter((e) => e.type === 'shot').length;
      if (ev.some((e) => e.type === 'hit')) launched = Math.max(launched, sim.ctx.bodies.get(b)!.getLinearVelocity().x);
    }
    return { launched, swings, peakCharge, hp: b.get(Health)?.hp ?? 100 };
  }

  it('winds up while held and swings on release, harder the longer it was held', () => {
    const tap = swing(4);
    expect(tap.swings).toBe(1);
    expect(tap.peakCharge).toBeGreaterThan(0);
    expect(tap.hp).toBeLessThan(100);
    const full = swing(CHARGE_MAX_TICKS, CHARGE_MAX_TICKS + 40);
    expect(full.swings).toBe(1);
    expect(full.hp).toBeLessThan(tap.hp);
    expect(full.launched).toBeGreaterThan(tap.launched * 2);
  });

  it('a full charge swings on its own even if the trigger stays held', () => {
    const { sim, gun } = duel('slugger', 1.0);
    let swings = 0;
    for (let i = 0; i < CHARGE_MAX_TICKS + 5; i++) {
      const ev = sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
      swings += ev.filter((e) => e.type === 'shot').length;
    }
    expect(swings).toBe(1);
    expect(gun.get(Weapon)?.charge).toBe(0);
  });
});

describe('Walker Mine', () => {
  it('lobs a mine that walks to the target and goes off on contact', () => {
    const { sim, b } = duel('walker-mine', 4.5);
    let mines = 0;
    let blasts = 0;
    for (let i = 0; i < 240 && blasts === 0; i++) {
      const ev = sim.step([hold({ attack: i === 0, aimX: 1, aimY: 0.2 }), idle, hold({}), hold({})]);
      mines = Math.max(mines, sim.ecs.query(Snake).filter((e) => e.get(Snake)?.bomb === 1).length);
      blasts += ev.filter((e) => e.type === 'explosion' && e.damage > 0).length;
    }
    expect(mines).toBe(1);
    expect(blasts).toBe(1);
    expect(b.get(Health)?.hp ?? 100).toBeLessThan(100);
    expect(sim.ecs.query(Snake).length).toBe(0);
  });

  it('a mine that never reaches anyone blows on its fuse, and a shot mine blows at once', () => {
    const { sim } = duel('walker-mine', 30);
    // Aim straight up so the mine lands near the shooter and stays away from B for the whole fuse.
    sim.step([hold({ attack: true, aimX: 0, aimY: 1 }), idle, hold({}), hold({})]);
    let blasts = 0;
    let lived = 0;
    for (let i = 0; i < 400 && blasts === 0; i++) {
      const ev = sim.step([hold({ moveX: -1, aimX: -1, aimY: 0 }), idle, hold({}), hold({})]);
      blasts += ev.filter((e) => e.type === 'explosion' && e.damage > 0).length;
      lived = i;
    }
    expect(blasts).toBe(1);
    expect(lived).toBeGreaterThan(150);

    const shot = duel('walker-mine', 30);
    shot.sim.step([hold({ attack: true, aimX: 0, aimY: 1 }), idle, hold({}), hold({})]);
    stepMany(shot.sim, 30, [hold({ aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
    const mine = shot.sim.ecs.query(Snake).find((e) => e.get(Snake)?.bomb === 1)!;
    expect(mine).toBeDefined();
    mine.set(Health, { hp: 0 });
    const ev = shot.sim.step([hold({ aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
    expect(ev.some((e) => e.type === 'explosion' && e.damage > 0)).toBe(true);
  });
});

describe('Mallet', () => {
  it('swings by itself, keeps the guard down, and flies off when spent', () => {
    const { sim, a, b, gun } = duel('mallet', 1.0);
    let swings = 0;
    for (let i = 0; i < 40; i++) {
      const ev = sim.step([hold({ block: true, aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
      swings += ev.filter((e) => e.type === 'shot').length;
      expect(a.get(Combat)?.blocking).toBe(false);
    }
    expect(swings).toBeGreaterThanOrEqual(2);
    expect(b.get(Health)?.hp ?? 100).toBeLessThan(100);
    expect(a.get(Status)?.encumbered ?? 0).toBeGreaterThan(0);
    gun.set(Weapon, { ammo: 1 });
    stepMany(sim, 40, [hold({ aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
    expect(gun.has(Held)).toBe(false);
    expect(gun.has(Loose)).toBe(true);
    stepMany(sim, 3, [hold({ aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
    expect(a.get(Status)?.encumbered ?? 0).toBe(0);
  });

  it('the holder cannot wall-kick', () => {
    const sim = makeSim({ settings: { playerCount: 1, items: 'off' } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'mallet', 4, 4, false);
    gun.add(Held(), HeldBy(p));
    // Into the gym's climb shaft wall (interior x 3..5), then hold jump against it.
    sim.ctx.bodies.get(p)?.setPosition({ x: 4.6, y: 6 });
    p.set(Transform, { x: 4.6, y: 6, angle: 0 });
    let kicked = false;
    for (let i = 0; i < 60; i++) {
      sim.step([hold({ moveX: 1, jump: i > 5, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      const v = sim.ctx.bodies.get(p)!.getLinearVelocity();
      if (v.x < -2 && v.y > 6) kicked = true;
    }
    expect(kicked).toBe(false);
  });
});

describe('Repulsor Puck', () => {
  it('plants a bumper where it lands that bats fighters away, then fades', () => {
    const { sim, a, b } = duel('repulsor-puck', 6);
    // B stands clear while the puck flies and settles.
    sim.step([hold({ attack: true, aimX: 1, aimY: 0.35 }), idle, hold({}), hold({})]);
    let planted: Entity[] = [];
    for (let i = 0; i < 120 && planted.length === 0; i++) {
      sim.step([hold({ aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
      planted = sim.ecs.query(Hazard).filter((e) => e.get(Hazard)?.kind === HazardKind.Repulsor);
    }
    expect(planted.length).toBe(1);
    const puck = planted[0]!;
    expect(puck.has(Lifetime)).toBe(true);
    const at = puck.get(Transform)!;

    // Walk B into it: shoved away from the puck with a sting of damage.
    sim.ctx.bodies.get(b)?.setPosition({ x: at.x + 0.9, y: at.y });
    b.set(Transform, { x: at.x + 0.9, y: at.y, angle: 0 });
    let shoved = 0;
    for (let i = 0; i < 20 && shoved === 0; i++) {
      const ev = sim.step([hold({ aimX: 1, aimY: 0 }), hold({ moveX: -1, aimX: -1, aimY: 0 }), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'hit')) shoved = sim.ctx.bodies.get(b)!.getLinearVelocity().x;
    }
    expect(shoved).toBeGreaterThan(4);
    expect(b.get(Health)?.hp ?? 100).toBeLessThan(100);
    void a;

    // Gone once its time is up.
    stepMany(sim, REPULSOR_TICKS + 5, [hold({ aimX: 1, aimY: 0 }), idle, hold({}), hold({})]);
    expect(sim.ecs.has(puck)).toBe(false);
  });
});
