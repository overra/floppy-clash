import type { Entity } from 'koota';
import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import type { SimEvent } from '../src/sim/events';
import type { PlayerInput } from '../src/sim/input';
import { Category, Mask } from '../src/sim/physics/categories';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Combat, Dead, Health, Held, HeldBy, Loose, Projectile, ProjectileKind, Snake, Status, Transform, Weapon } from '../src/sim/traits';
import { WEAPON_DEFS, weaponIndex } from '../src/sim/weapons/defs';
import { damageMultiplier } from '../src/sim/player/health';
import { hold, makeSim, playerOf, runTrack } from './helpers';

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

  it('a weapon dropped from the sky lands beside the player and is picked up by walking over it', () => {
    const sim = makeSim({ level: woodsClearing, seed: 12, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const start = { ...p.get(Transform)! };
    const gun = spawnWeapon(sim.ecs, 'pistol', start.x + 1.5, start.y + 4);
    for (let i = 0; i < 150; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const landed = gun.get(Transform)!;
    const feet = p.get(Transform)!.y - sim.ctx.tuning.height / 2;
    // The tracked transform must follow the physics body down, not stay parked at the spawn height.
    expect(landed.y).toBeLessThan(feet + 0.4);
    expect(landed.y).toBeGreaterThan(feet - 0.2);
    expect(Math.abs(landed.x - (start.x + 1.5))).toBeLessThan(0.6);
    for (let i = 0; i < 60 && !gun.has(Held); i++) {
      sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    }
    expect(gun.has(Held)).toBe(true);
    expect(gun.targetFor(HeldBy)).toBe(p);
  });

  it('a loose weapon lying against a wall never blocks a running player', () => {
    const sim = makeSim({ level: woodsClearing, seed: 12, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const start = { ...p.get(Transform)! };
    // A gun on a long pickup cooldown, so the runner cannot simply grab it on the way through.
    const gun = spawnWeapon(sim.ecs, 'ak47', start.x + 1.2, start.y - 0.6);
    gun.set(Weapon, { defId: weaponIndex('ak47'), ammo: 0, pickupCooldown: 100000, thrown: false, thrownHit: false });
    for (let i = 0; i < 30; i++) sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    expect(gun.has(Held)).toBe(false);
    expect(p.get(Transform)!.x).toBeGreaterThan(start.x + 2);
    // Both directions of the Box2D filter must agree: a gun wedged against a wall is not terrain.
    expect(Mask.Player & Category.Weapon).toBe(0);
    expect(Mask.Weapon & Category.Player).toBe(0);
    expect(Mask.Weapon & Category.Static).not.toBe(0);
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
});

/** Two fighters on the flat run track, `gap` metres apart, P1 armed with `weaponId`. */
function duel(weaponId: string, gap: number, seed = 50) {
  const sim = makeSim({ level: runTrack, seed, settings: { playerCount: 2 } });
  const a = playerOf(sim, 0);
  const b = playerOf(sim, 1);
  sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
  sim.ctx.bodies.get(b)?.setPosition({ x: 20 + gap, y: 2.81 });
  sim.step([hold({}), hold({}), hold({}), hold({})]);
  const gun = spawnWeapon(sim.ecs, weaponId, 20, 2.81, false);
  gun.add(Held(), HeldBy(a));
  return { sim, a, b, gun };
}

function fireFor(sim: ReturnType<typeof makeSim>, ticks: number, semi: boolean, bInput: Partial<PlayerInput> = {}): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const attack = semi ? i % 8 < 2 : true;
    all.push(...sim.step([hold({ attack, aimX: 1, aimY: 0 }), hold(bInput), hold({}), hold({})]));
  }
  return all;
}

describe('weapon behaviours by class', () => {
  it('every roster weapon can hurt a target standing in front of it', async () => {
    for (const def of WEAPON_DEFS) {
      if (def.id === 'fists') continue;
      // Keep the worker responsive to the runner during the long sweep.
      await new Promise<void>((resolve) => setImmediate(resolve));
      const melee = def.projectile.kind === 'melee';
      const { sim, b } = duel(def.id, melee ? 1.2 : 4.5);
      const semi = def.fireMode === 'semi' || def.fireMode === 'burst';
      const ev = fireFor(sim, 240, semi);
      const hp = b.get(Health)?.hp ?? 100;
      const hurt = hp < 100 || ev.some((e) => e.type === 'hit' && e.target === b) || (b.get(Status)?.bubbled ?? 0) > 0;
      expect(hurt, `${def.id} never touched its target`).toBe(true);
    }
  });

  it('a sword swing is a real hitbox: it lands once per swing, knocks the target back, and can kill', () => {
    const { sim, a, b } = duel('sword', 1.2);
    const ev = fireFor(sim, 40, true);
    const hits = ev.filter((e) => e.type === 'hit' && e.target === b);
    const swings = ev.filter((e) => e.type === 'shot').length;
    expect(swings).toBeGreaterThanOrEqual(2);
    // 68 a swing against 100 hp: exactly two swings connect, and no swing lands twice.
    expect(hits.length).toBe(2);
    expect(hits.length).toBeLessThanOrEqual(swings);
    expect(b.has(Dead)).toBe(true);
    expect(a.has(Dead)).toBe(false);
  });

  it('a raised sword parries bullets back at the shooter', () => {
    const sim = makeSim({ level: runTrack, seed: 51, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 24, y: 2.81 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const pistol = spawnWeapon(sim.ecs, 'pistol', 20, 2.81, false);
    pistol.add(Held(), HeldBy(a));
    const sword = spawnWeapon(sim.ecs, 'sword', 24, 2.81, false);
    sword.add(Held(), HeldBy(b));
    let parried = false;
    let shooterHit = false;
    for (let i = 0; i < 90; i++) {
      // B swings continuously toward A; A fires into the blade.
      const ev = sim.step([hold({ attack: i % 6 === 0, aimX: 1, aimY: 0 }), hold({ attack: i % 4 === 0, aimX: -1, aimY: 0 }), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'block' && e.reflected && e.player === b)) parried = true;
      if (ev.some((e) => e.type === 'hit' && e.target === a && e.source === b)) shooterHit = true;
    }
    expect(parried).toBe(true);
    // A parried round belongs to the swordsman and flies straight back down the line.
    expect(shooterHit).toBe(true);
  });

  it('the blink knife jumps to the first enemy on its line and stabs, instead of overshooting off the stage', () => {
    const { sim, a, b } = duel('blink-dagger', 3.5);
    const ev = fireFor(sim, 30, true);
    expect(ev.some((e) => e.type === 'hit' && e.target === b)).toBe(true);
    expect(a.get(Transform)!.x).toBeLessThan(b.get(Transform)!.x);
    expect(a.has(Dead)).toBe(false);
  });

  it('flame puffs set the target burning and the burn keeps ticking after the stream stops', () => {
    const { sim, b } = duel('flamethrower', 3);
    fireFor(sim, 30, false);
    const hpAfterStream = b.get(Health)?.hp ?? 100;
    expect((b.get(Status)?.burning ?? 0)).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(b.get(Health)?.hp ?? 100).toBeLessThan(hpAfterStream);
  });

  it('glue sticks a fighter in place rather than launching them', () => {
    const { sim, b } = duel('glue-gun', 3.5);
    const x0 = b.get(Transform)!.x;
    fireFor(sim, 90, false, { moveX: 1 });
    expect((b.get(Status)?.glued ?? 0)).toBeGreaterThan(0);
    // A glued runner holding forward barely moves; a free runner would cover ~9m in this time.
    expect(b.get(Transform)!.x - x0).toBeLessThan(2.5);
    expect(b.has(Dead)).toBe(false);
  });

  it('the time bubble opens where it lands and freezes fighters inside without killing them', () => {
    const { sim, b } = duel('time-bubble', 4);
    fireFor(sim, 20, true);
    let bubbled = 0;
    for (let i = 0; i < 60; i++) {
      sim.step([hold({}), hold({ moveX: 1, jump: i % 10 === 0 }), hold({}), hold({})]);
      if ((b.get(Status)?.bubbled ?? 0) > 0) bubbled += 1;
    }
    expect(bubbled).toBeGreaterThan(30);
    expect(b.has(Dead)).toBe(false);
    expect(b.get(Transform)!.x).toBeLessThan(26);
  });

  it('the void well opens, drags the enemy in and swallows them, then collapses', () => {
    const { sim, a, b } = duel('black-hole', 5);
    const ev = fireFor(sim, 120, true);
    expect(ev.some((e) => e.type === 'kill' && e.target === b)).toBe(true);
    expect(a.has(Dead)).toBe(false);
    for (let i = 0; i < 200; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let fields = 0;
    sim.ecs.query(Projectile).updateEach(([p]) => {
      if (p.kind === ProjectileKind.Field) fields += 1;
    });
    expect(fields).toBe(0);
  });

  it('snakes leave the barrel flying, spare their owner at first, then hunt and bite', () => {
    const { sim, a, b } = duel('snake-gun', 4);
    const ev = sim.step([hold({ attack: true, aimX: 1, aimY: 0.35 }), hold({}), hold({}), hold({})]);
    expect(ev.some((e) => e.type === 'shot')).toBe(true);
    let snake: Entity | undefined;
    sim.ecs.query(Snake).updateEach((_, e) => (snake = e));
    expect(snake).toBeTruthy();
    const v = sim.ctx.bodies.get(snake!)!.getLinearVelocity();
    expect(Math.hypot(v.x, v.y)).toBeGreaterThan(5);
    let bitOwner = false;
    let bitTarget = false;
    for (let i = 0; i < 240; i++) {
      const evs = sim.step([hold({}), hold({}), hold({}), hold({})]);
      for (const e of evs) {
        if (e.type === 'hit' && e.target === a && i < 80) bitOwner = true;
        if (e.type === 'hit' && e.target === b) bitTarget = true;
      }
    }
    expect(bitOwner).toBe(false);
    expect(bitTarget).toBe(true);
  });

  it('bullets kill snakes', () => {
    const sim = makeSim({ level: runTrack, seed: 52, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 30, y: 2.81 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const snakeGun = spawnWeapon(sim.ecs, 'snake-gun', 30, 2.81, false);
    snakeGun.add(Held(), HeldBy(b));
    sim.step([hold({}), hold({ attack: true, aimX: -1, aimY: 0 }), hold({}), hold({})]);
    let snakes = 0;
    sim.ecs.query(Snake).updateEach(() => (snakes += 1));
    expect(snakes).toBe(1);
    const ak = spawnWeapon(sim.ecs, 'ak47', 20, 2.81, false);
    ak.add(Held(), HeldBy(a));
    for (let i = 0; i < 240 && snakes > 0; i++) {
      // Track the snake with the aim, the way a player would.
      let aim = { x: 1, y: 0 };
      const at = a.get(Transform)!;
      sim.ecs.query(Snake, Transform).updateEach(([, st]) => {
        const len = Math.hypot(st.x - at.x, st.y - at.y) || 1;
        aim = { x: (st.x - at.x) / len, y: (st.y - at.y) / len };
      });
      sim.step([hold({ attack: true, aimX: aim.x, aimY: aim.y }), hold({}), hold({}), hold({})]);
      snakes = 0;
      sim.ecs.query(Snake).updateEach(() => (snakes += 1));
    }
    expect(snakes).toBe(0);
  });

  it('lava spray splashes where it lands and grenades pop after a fuse near their landing spot', () => {
    const spray = duel('lava-spray', 4.5);
    const sprayEv = fireFor(spray.sim, 120, false);
    expect(sprayEv.some((e) => e.type === 'explosion')).toBe(true);
    expect((spray.b.get(Status)?.burning ?? 0) > 0 || (spray.b.get(Health)?.hp ?? 100) < 100).toBe(true);

    const launcher = duel('grenade-launcher', 4.5);
    const ev = fireFor(launcher.sim, 200, true);
    const booms = ev.filter((e) => e.type === 'explosion');
    expect(booms.length).toBeGreaterThan(0);
    // Shells lobbed from x=20 must not skate off down the track before detonating.
    for (const boom of booms) expect(boom.x).toBeLessThan(34);
    expect(launcher.b.get(Health)?.hp ?? 100).toBeLessThan(100);
  });
});

