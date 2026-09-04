import { describe, expect, it } from 'vitest';
import { WEAPON_DEFS, weaponIndex } from '../src/sim/weapons/defs';
import { LAUNCH_OVERLAY, LAUNCH_THROWN_DAMAGE, LAUNCH_WEAPONS } from '../src/sim/weapons/launch';
import { droppableWeapons, resolveWeaponDefs, weaponDef } from '../src/sim/weapons/resolve';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Health, Loose, Transform, Weapon } from '../src/sim/traits';
import { hold, makeSim, playerOf, runTrack, stepMany } from './helpers';

describe('per-mode weapon table', () => {
  it('standing mode plays the base table untouched; launch mode folds the overlay in', () => {
    expect(resolveWeaponDefs('standing')).toBe(WEAPON_DEFS);
    const launch = resolveWeaponDefs('launch');
    expect(launch).toHaveLength(WEAPON_DEFS.length);
    for (let i = 0; i < launch.length; i++) expect(launch[i]!.id).toBe(WEAPON_DEFS[i]!.id);
    const mini = weaponDef(launch, weaponIndex('minigun'));
    const base = weaponDef(WEAPON_DEFS, weaponIndex('minigun'));
    expect(mini.knockback).toBeCloseTo(base.knockback * LAUNCH_OVERLAY.minigun!.launchScale!, 6);
    expect(mini.knockback).toBeLessThan(base.knockback);
    const sword = weaponDef(launch, weaponIndex('sword'));
    expect(sword.knockback).toBeGreaterThan(weaponDef(WEAPON_DEFS, weaponIndex('sword')).knockback);
    // Untouched weapons keep their numbers but still get the thrown-damage cap.
    const pistol = weaponDef(launch, weaponIndex('pistol'));
    expect(pistol.knockback).toBe(weaponDef(WEAPON_DEFS, weaponIndex('pistol')).knockback);
    for (const d of launch) expect(d.thrownDamage).toBeLessThanOrEqual(LAUNCH_THROWN_DAMAGE);
  });

  it('every overlay entry and curated id names a real weapon', () => {
    const ids = new Set(WEAPON_DEFS.map((d) => d.id));
    for (const id of Object.keys(LAUNCH_OVERLAY)) expect(ids.has(id), id).toBe(true);
    for (const id of LAUNCH_WEAPONS) expect(ids.has(id), id).toBe(true);
    // Rapid fire is tamed, single hits are not.
    expect(LAUNCH_OVERLAY.uzi!.launchScale!).toBeLessThan(0.5);
    expect(LAUNCH_OVERLAY['sawed-off']!.launchScale!).toBeLessThan(0.5);
    expect(LAUNCH_OVERLAY.sniper!.launchScale!).toBeGreaterThan(1);
  });

  it('the launch drop pool is the curated list when everything is enabled, and honours a hand-picked list', () => {
    const launch = resolveWeaponDefs('launch');
    const pool = droppableWeapons(launch, 'all', 'launch').map((d) => d.id);
    expect(pool.sort()).toEqual([...LAUNCH_WEAPONS].sort());
    expect(pool).not.toContain('snake-gun');
    const picked = droppableWeapons(launch, ['snake-gun', 'uzi'], 'launch').map((d) => d.id);
    expect(picked.sort()).toEqual(['snake-gun', 'uzi']);
    const standing = droppableWeapons(WEAPON_DEFS, 'all', 'standing');
    expect(standing.length).toBeGreaterThan(LAUNCH_WEAPONS.length);
  });

  it('the sim context carries the table for its mode', () => {
    const launch = makeSim({ settings: { mode: 'launch', playerCount: 1 } });
    expect(weaponDef(launch.ctx.weapons, weaponIndex('uzi')).knockback).toBeLessThan(weaponDef(WEAPON_DEFS, weaponIndex('uzi')).knockback);
    const standing = makeSim({ settings: { playerCount: 1 } });
    expect(standing.ctx.weapons).toBe(WEAPON_DEFS);
  });
});

describe('launch mode weapon behaviour', () => {
  /** A holds a weapon and fires once at B standing a few metres away on the run track. */
  function shoot(mode: 'standing' | 'launch', weapon: string) {
    const sim = makeSim({ level: runTrack, seed: 5, settings: { mode, playerCount: 2, bots: 0, items: 'off' } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 24, y: 2.81 });
    spawnWeapon(sim.ecs, weapon, 20, 3.2);
    stepMany(sim, 30, [hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
    let launched = 0;
    for (let i = 0; i < 20; i++) {
      const ev = sim.step([hold({ attack: i === 0, aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'hit')) launched = Math.max(launched, sim.ctx.bodies.get(b)!.getLinearVelocity().x);
    }
    return { sim, b, launched };
  }

  it('a tamed weapon shoves less in launch mode than its base knockback would', () => {
    const standing = shoot('standing', 'sawed-off');
    const kbStanding = standing.launched;
    expect(kbStanding).toBeGreaterThan(5);
    const launch = shoot('launch', 'sawed-off');
    // Five pellets at 0.35 scale, times the ~1x percent curve after the pellets land: well under the base.
    expect(launch.launched).toBeLessThan(kbStanding * 0.7);
    expect(launch.b.get(Health)?.percent ?? 0).toBeGreaterThan(0);
  });

  it('a thrown weapon in launch mode shoves for capped damage; in standing mode it only hurts', () => {
    const run = (mode: 'standing' | 'launch') => {
      const sim = makeSim({ level: runTrack, seed: 5, settings: { mode, playerCount: 2, bots: 0, items: 'off' } });
      const a = playerOf(sim, 0);
      const b = playerOf(sim, 1);
      sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
      sim.ctx.bodies.get(b)?.setPosition({ x: 22.5, y: 2.81 });
      spawnWeapon(sim.ecs, 'pistol', 20, 3.2);
      stepMany(sim, 30, [hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
      let vx = 0;
      let hits = 0;
      for (let i = 0; i < 30; i++) {
        const ev = sim.step([hold({ throw: i === 0, aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
        if (ev.some((e) => e.type === 'hit')) {
          hits += 1;
          vx = sim.ctx.bodies.get(b)!.getLinearVelocity().x;
        }
      }
      const thrown = sim.ecs.query(Weapon, Loose, Transform).length;
      return { hits, vx, hp: b.get(Health)?.hp ?? 0, percent: b.get(Health)?.percent ?? 0, thrown };
    };
    const standing = run('standing');
    expect(standing.hits).toBe(1);
    expect(standing.hp).toBeCloseTo(100 - 55, 5);
    expect(Math.abs(standing.vx)).toBeLessThan(1);
    const launch = run('launch');
    expect(launch.hits).toBe(1);
    expect(launch.hp).toBe(100);
    expect(launch.percent).toBeLessThanOrEqual(LAUNCH_THROWN_DAMAGE);
    expect(launch.percent).toBeGreaterThan(0);
    expect(launch.vx).toBeGreaterThan(3);
  });
});
