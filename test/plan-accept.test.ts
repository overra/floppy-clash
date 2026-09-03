import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { shouldOfferRemap } from '../src/input/remap';
import { heldWeaponHitKind, heldWeaponIntercept, spawnSnake } from '../src/sim/weapons/projectiles';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { takeDamage } from '../src/sim/player/health';
import { WEAPON_DEFS, weaponIndex } from '../src/sim/weapons/defs';
import {
  Aim,
  Combat,
  Controller,
  Dead,
  Destructible,
  Hazard,
  HazardKind,
  Health,
  Held,
  HeldBy,
  Loose,
  OwnedBy,
  Projectile,
  ProjectileKind,
  Snake,
  Status,
  Transform,
  Weapon,
} from '../src/sim/traits';
import { hold, makeSim, pin, playerOf } from './helpers';

describe('PLAN accept stand-ins', () => {
  it('lava deals 35 then respects cooldown', () => {
    const sim = makeSim({ level: getLevel('test-lava'), seed: 23, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const lava = getLevel('test-lava').objects.find((o) => o.type === 'lava');
    sim.ctx.bodies.get(p)?.setPosition({ x: lava?.x ?? 16, y: (lava?.y ?? 1.6) + 0.2 });
    p.set(Transform, { x: lava?.x ?? 16, y: (lava?.y ?? 1.6) + 0.2, angle: 0 });
    const before = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const mid = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = p.get(Health)?.hp ?? 100;
    expect(before - mid).toBe(35);
    expect(after).toBe(mid);
  });

  it('laser raycast kills a player in the beam while on', () => {
    const sim = makeSim({ level: getLevel('test-laser'), seed: 57, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    for (let i = 0; i < 80; i++) {
      sim.ctx.bodies.get(p)?.setPosition({ x: 8, y: 7 });
      p.set(Transform, { x: 8, y: 7, angle: 0 });
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0) break;
    }
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('crusher kills when overlapping the player', () => {
    const sim = makeSim({ level: getLevel('test-crusher'), seed: 24, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const obj = getLevel('test-crusher').objects.find((o) => o.type === 'crusher');
    sim.ctx.bodies.get(p)?.setPosition({ x: obj?.x ?? 18, y: obj?.y ?? 8 });
    p.set(Transform, { x: obj?.x ?? 18, y: obj?.y ?? 8, angle: 0 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('ducking on a conveyor anchors (no belt carry)', () => {
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
      sim.step([hold({ down: true }), hold({}), hold({}), hold({})]);
      xs.push(p.get(Transform)?.x ?? 0);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.35);
  });

  it('ice is slipperier than a normal floor', () => {
    const ice = makeSim({ level: getLevel('test-ice'), seed: 54, settings: { playerCount: 1 } });
    const solid = makeSim({ level: getLevel('test-solid'), seed: 54, settings: { playerCount: 1 } });
    const coast = (sim: ReturnType<typeof makeSim>, x: number) => {
      const p = playerOf(sim);
      sim.ctx.bodies.get(p)?.setPosition({ x, y: 3.2 });
      for (let i = 0; i < 30; i++) sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
      for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
      const body = sim.ctx.bodies.get(p);
      return { vx: Math.abs(body?.getLinearVelocity().x ?? 0), x: body?.getPosition().x ?? 0 };
    };
    const onIce = coast(ice, 14);
    const onSolid = coast(solid, 8);
    expect(onIce.x).toBeGreaterThan(10);
    expect(onIce.x).toBeLessThan(22);
    expect(onIce.vx).toBeGreaterThan(onSolid.vx + 0.8);
  });

  it('crates are pushable', () => {
    const sim = makeSim({ level: getLevel('test-crate'), seed: 55, settings: { playerCount: 1 } });
    const crate = { x: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crate) crate.x = t.x;
    });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: crate.x - 0.9, y: 3.2 });
    for (let i = 0; i < 40; i++) sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    let after = crate.x;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crate) after = t.x;
    });
    expect(after).toBeGreaterThan(crate.x + 0.15);
  });

  it('momentum platform tilts or sinks under a standing player', () => {
    const sim = makeSim({
      level: getLevel('test-platform.momentum'),
      seed: 60,
      settings: { playerCount: 1 },
    });
    const plat = { x: 16, y: 6, angle: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Momentum) {
        plat.x = t.x;
        plat.y = t.y;
        plat.angle = t.angle;
      }
    });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: plat.x + 1.2, y: plat.y + 1.1 });
    for (let i = 0; i < 90; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let y1 = plat.y;
    let a1 = plat.angle;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Momentum) {
        y1 = t.y;
        a1 = t.angle;
      }
    });
    expect(y1 < plat.y - 0.04 || Math.abs(a1 - plat.angle) > 0.03).toBe(true);
  });

  it('rotating platform changes angle', () => {
    const sim = makeSim({
      level: getLevel('test-platform.rotating'),
      seed: 61,
      settings: { playerCount: 1 },
    });
    const a0 = { n: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.RotatingPlatform) a0.n = t.angle;
    });
    for (let i = 0; i < 40; i++) sim.step();
    let a1 = a0.n;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.RotatingPlatform) a1 = t.angle;
    });
    expect(Math.abs(a1 - a0.n)).toBeGreaterThan(0.2);
  });

  it('empty weapon is flung', () => {
    const sim = makeSim({ seed: 70, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    const w = gun.get(Weapon)!;
    gun.set(Weapon, { ...w, ammo: 0 });
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(gun.has(Loose)).toBe(true);
    expect(gun.get(Weapon)?.thrown).toBe(true);
  });

  it('M16 burst fires three shots over ticks, not at once', () => {
    const sim = makeSim({ seed: 71, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'm16', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    const shots: number[] = [];
    for (let i = 0; i < 16; i++) {
      const ev = sim.step([
        hold({ attack: i === 0, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
      shots.push(ev.filter((e) => e.type === 'shot').length);
    }
    expect(shots[0]).toBe(1);
    expect(shots.reduce((a, b) => a + b, 0)).toBe(3);
    expect(shots.filter((n) => n > 0).length).toBe(3);
    expect(gun.get(Weapon)?.ammo).toBe(29);
  });

  it('projectile head hit applies 2× damage', () => {
    const sim = makeSim({ seed: 72, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4.55 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12.2, y: 4 });
    a.set(Transform, { x: 10, y: 4.55, angle: 0 });
    b.set(Transform, { x: 12.2, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const before = b.get(Health)?.hp ?? 100;
    let zone = '';
    let dmg = 0;
    for (let i = 0; i < 10; i++) {
      const ev = sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
      const hit = ev.find((e) => e.type === 'hit');
      if (hit && hit.type === 'hit') {
        zone = hit.zone;
        dmg = hit.damage;
      }
    }
    const lost = before - (b.get(Health)?.hp ?? 100);
    expect(zone).toBe('head');
    expect(dmg).toBe(64);
    expect(lost).toBe(64);
  });

  it('projectile neck hit applies 1.5× damage', () => {
    const sim = makeSim({ seed: 72, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4.35 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12.2, y: 4 });
    a.set(Transform, { x: 10, y: 4.35, angle: 0 });
    b.set(Transform, { x: 12.2, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    let zone = '';
    let dmg = 0;
    for (let i = 0; i < 10; i++) {
      const ev = sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
      const hit = ev.find((e) => e.type === 'hit');
      if (hit && hit.type === 'hit') {
        zone = hit.zone;
        dmg = hit.damage;
      }
    }
    expect(zone).toBe('neck');
    expect(dmg).toBe(48);
  });

  it('status effects burn / slow / glue / bubble apply', () => {
    const ice = makeSim({ seed: 73, settings: { playerCount: 2 } });
    const a = playerOf(ice, 0);
    const b = playerOf(ice, 1);
    ice.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    ice.ctx.bodies.get(b)?.setPosition({ x: 11.2, y: 4 });
    const gun = spawnWeapon(ice.ecs, 'ice-gun', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    for (let i = 0; i < 16; i++) {
      ice.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(b.get(Status)?.slowed ?? 0).toBeGreaterThan(0);

    const glue = makeSim({ seed: 74, settings: { playerCount: 2 } });
    const ga = playerOf(glue, 0);
    const gb = playerOf(glue, 1);
    glue.ctx.bodies.get(ga)?.setPosition({ x: 10, y: 4 });
    glue.ctx.bodies.get(gb)?.setPosition({ x: 11.1, y: 4 });
    const goo = spawnWeapon(glue.ecs, 'glue-gun', 10, 5);
    goo.add(Held(), HeldBy(ga));
    goo.remove(Loose);
    for (let i = 0; i < 16; i++) {
      glue.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(gb.get(Status)?.glued ?? 0).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) glue.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const vx = glue.ctx.bodies.get(gb)?.getLinearVelocity().x ?? 1;
    expect(Math.abs(vx)).toBeLessThan(0.2);

    const burn = makeSim({ seed: 75, settings: { playerCount: 1 } });
    const bp = playerOf(burn);
    bp.set(Status, { burning: 60, slowed: 0, glued: 0, bubbled: 0 });
    const hp0 = bp.get(Health)?.hp ?? 100;
    burn.step([hold({}), hold({}), hold({}), hold({})]);
    expect((bp.get(Health)?.hp ?? 100)).toBe(hp0 - 5);
    expect(bp.get(Status)?.burning).toBe(59);

    const fresh = makeSim({ seed: 76, settings: { playerCount: 1 } });
    const fp = playerOf(fresh);
    fp.set(Status, { burning: 360, slowed: 0, glued: 0, bubbled: 0 });
    const fhp = fp.get(Health)?.hp ?? 100;
    fresh.step([hold({}), hold({}), hold({}), hold({})]);
    expect(fp.get(Health)?.hp).toBe(fhp);
    expect(fp.get(Status)?.burning).toBe(359);
  });

  it('a player can stand on a loose weapon (weapon jump)', () => {
    const sim = makeSim({ seed: 75, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const t = p.get(Transform)!;
    const gun = spawnWeapon(sim.ecs, 'rpg', t.x + 0.1, t.y - 0.15);
    const w = gun.get(Weapon)!;
    gun.set(Weapon, { ...w, pickupCooldown: 999 });
    let grounded = false;
    for (let i = 0; i < 40; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (p.get(Controller)?.grounded) grounded = true;
    }
    expect(grounded).toBe(true);
  });

  it('explosions deal self-damage', () => {
    const sim = makeSim({ seed: 76, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 4, y: 3.2 });
    p.set(Transform, { x: 4, y: 3.2, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'rpg', 4, 4);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    const hp0 = p.get(Health)?.hp ?? 100;
    for (let i = 0; i < 30; i++) {
      sim.step([hold({ attack: i === 1, aimX: -1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect((p.get(Health)?.hp ?? 100) < hp0 || p.has(Dead)).toBe(true);
  });

  it('western barrels spawn snakes and levels ship starting weapons', () => {
    const level = getLevel('western-01');
    expect(level.startingWeapons?.length).toBeGreaterThan(0);
    const sim = makeSim({ level, seed: 80, settings: { playerCount: 1 } });
    sim.ecs.query(Destructible, Hazard).updateEach(([d, hz]) => {
      if (hz.kind === HazardKind.Barrel) d.hp = 0;
    });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    let snakes = 0;
    sim.ecs.query(Snake).updateEach(() => {
      snakes += 1;
    });
    expect(snakes).toBeGreaterThanOrEqual(1);
  });

  it('held-weapon far end can deflect a bullet', () => {
    const sim = makeSim({ seed: 81, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12.2, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 12.2, y: 4, angle: 0 });
    const attacker = spawnWeapon(sim.ecs, 'pistol', 10, 5);
    attacker.add(Held(), HeldBy(a));
    attacker.remove(Loose);
    const spear = spawnWeapon(sim.ecs, 'spear', 12.2, 5);
    spear.add(Held(), HeldBy(b));
    spear.remove(Loose);
    const hp0 = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 12; i++) {
      sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({ aimX: -1, aimY: 0 }),
        hold({}),
        hold({}),
      ]);
    }
    expect(b.get(Health)?.hp ?? 100).toBe(hp0);
    expect(spear.has(Loose)).toBe(false);
  });

  it('offers remap for non-standard mappings', () => {
    expect(shouldOfferRemap('', 'pad', {})).toBe(true);
    expect(shouldOfferRemap('standard', 'pad', {})).toBe(false);
    expect(shouldOfferRemap('standard', 'pad', { pad: { jump: 0, attack: 7, block: 6, throw: 3, pause: 9 } })).toBe(
      false,
    );
    expect(shouldOfferRemap('xbox', 'weird', {})).toBe(true);
  });

  it('spikeball swings on its hang joint', () => {
    const sim = makeSim({ level: getLevel('test-spikeball'), seed: 82, settings: { playerCount: 1 } });
    const x0 = { n: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) x0.n = t.x;
    });
    for (let i = 0; i < 40; i++) sim.step();
    let x1 = x0.n;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) x1 = t.x;
    });
    expect(Math.abs(x1 - x0.n)).toBeGreaterThan(0.15);
  });

  it('laser weapon vanishes when knocked from the hand', () => {
    const sim = makeSim({ seed: 83, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 10.7, y: 4 });
    const gun = spawnWeapon(sim.ecs, 'laser', 10, 5);
    gun.add(Held(), HeldBy(b));
    gun.remove(Loose);
    for (let i = 0; i < 10; i++) {
      sim.step([
        hold({ attack: i === 2, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
    }
    expect(sim.ecs.has(gun)).toBe(false);
  });

  it('time bubble freezes the victim in place', () => {
    const sim = makeSim({ seed: 84, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 6, y: 2 });
    p.set(Status, { burning: 0, slowed: 0, glued: 0, bubbled: 40 });
    sim.step([hold({ moveX: 1, jump: true }), hold({}), hold({}), hold({})]);
    const v = sim.ctx.bodies.get(p)?.getLinearVelocity();
    expect(Math.abs(v?.x ?? 1)).toBeLessThan(0.05);
    expect(Math.abs(v?.y ?? 1)).toBeLessThan(0.05);
  });

  it('time bubble freezes on hit then explodes later', () => {
    const sim = makeSim({ seed: 85, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 11.2, y: 4 });
    const gun = spawnWeapon(sim.ecs, 'time-bubble', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const hp0 = b.get(Health)?.hp ?? 100;
    let froze = false;
    let exploded = false;
    for (let i = 0; i < 120; i++) {
      const ev = sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
      if ((b.get(Status)?.bubbled ?? 0) > 0 && (b.get(Health)?.hp ?? 100) > hp0 - 80) froze = true;
      if (ev.some((e) => e.type === 'explosion')) exploded = true;
    }
    expect(froze).toBe(true);
    expect(exploded).toBe(true);
    expect((b.get(Health)?.hp ?? 100) < hp0 - 50 || b.has(Dead)).toBe(true);
  });

  it('thruster pushes the target then pops for 15', () => {
    const sim = makeSim({ seed: 86, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12.2, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 12.2, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'thruster', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const hp0 = b.get(Health)?.hp ?? 100;
    let pushed = false;
    let popped = false;
    for (let i = 0; i < 80; i++) {
      const ev = sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
      const vx = sim.ctx.bodies.get(b)?.getLinearVelocity().x ?? 0;
      if (vx > 2 && (b.get(Health)?.hp ?? 100) > hp0 - 10) pushed = true;
      if (ev.some((e) => e.type === 'explosion')) popped = true;
    }
    expect(pushed).toBe(true);
    expect(popped).toBe(true);
    const lost = hp0 - (b.get(Health)?.hp ?? 100);
    expect(lost).toBeGreaterThanOrEqual(15);
  });

  it('god pistol rolls 30–60 damage per shot', () => {
    const damages: number[] = [];
    for (let seed = 90; seed < 96; seed++) {
      const sim = makeSim({ seed, settings: { playerCount: 2 } });
      const a = playerOf(sim, 0);
      const b = playerOf(sim, 1);
      sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
      sim.ctx.bodies.get(b)?.setPosition({ x: 12.2, y: 4 });
      a.set(Transform, { x: 10, y: 4, angle: 0 });
      b.set(Transform, { x: 12.2, y: 4, angle: 0 });
      const gun = spawnWeapon(sim.ecs, 'god-pistol', 10, 5);
      gun.add(Held(), HeldBy(a));
      gun.remove(Loose);
      for (let i = 0; i < 10; i++) {
        const ev = sim.step([
          hold({ attack: i === 1, aimX: 1, aimY: 0 }),
          hold({}),
          hold({}),
          hold({}),
        ]);
        const hit = ev.find((e) => e.type === 'hit');
        if (hit && hit.type === 'hit') damages.push(hit.damage);
      }
    }
    expect(damages.length).toBeGreaterThan(0);
    expect(Math.min(...damages)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...damages)).toBeLessThanOrEqual(60);
  });

  it('black hole attractor radius grows over its fuse', () => {
    const sim = makeSim({ seed: 87, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 8, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 14.1, y: 4 });
    a.set(Transform, { x: 8, y: 4, angle: 0 });
    b.set(Transform, { x: 14.1, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'black-hole', 8, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    sim.ecs.query(Projectile).updateEach(([p], e) => {
      p.vx = 0;
      p.vy = 0;
      p.x = 12;
      p.y = 4;
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
      sim.ctx.bodies.get(e)?.setPosition({ x: 12, y: 4 });
    });
    const x0 = b.get(Transform)?.x ?? 14.1;
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const early = b.get(Transform)?.x ?? 14.1;
    for (let i = 0; i < 120; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const late = b.get(Transform)?.x ?? 14.1;
    expect(Math.abs(early - x0)).toBeLessThan(1.4);
    expect(late).toBeLessThan(early - 0.2);
  });

  it('armed block-punch still fires a punch (cannot shoot)', () => {
    const sim = makeSim({ seed: 88, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    // Aim is straight up — put B in the punch circle at (10, 4.9), not beside A.
    sim.ctx.bodies.get(b)?.setPosition({ x: 10.15, y: 4.85 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 10.15, y: 4.85, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const hp0 = b.get(Health)?.hp ?? 100;
    const ammo0 = gun.get(Weapon)?.ammo ?? 15;
    const vy0 = sim.ctx.bodies.get(a)?.getLinearVelocity().y ?? 0;
    // Same tick: block becomes armed-punch-legal, attack rising edge, B still in the circle.
    sim.step([
      hold({ block: true, attack: true, aimX: 0, aimY: 1 }),
      hold({}),
      hold({}),
      hold({}),
    ]);
    expect(gun.get(Weapon)?.ammo).toBe(ammo0);
    expect((b.get(Health)?.hp ?? 100)).toBeLessThan(hp0);
    for (let i = 0; i < 5; i++) {
      sim.step([hold({ block: true, aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
    }
    const vy1 = sim.ctx.bodies.get(a)?.getLinearVelocity().y ?? 0;
    expect(vy1).toBeGreaterThan(vy0 + 2);
  });

  it('rising lava lifts its surface over time', () => {
    const sim = makeSim({ level: getLevel('test-lava'), seed: 89, settings: { playerCount: 1 } });
    const y0 = { n: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Lava) y0.n = t.y;
    });
    for (let i = 0; i < 90; i++) sim.step();
    let y1 = y0.n;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Lava) y1 = t.y;
    });
    expect(y1).toBeGreaterThan(y0.n + 0.02);
  });

  it('saw follows an optional path', () => {
    const wobble = makeSim({ level: getLevel('test-saw'), seed: 90, settings: { playerCount: 1 } });
    const wobbleXs: number[] = [];
    for (let i = 0; i < 80; i++) {
      wobble.step();
      wobble.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
        if (hz.kind === HazardKind.Saw) wobbleXs.push(t.x);
      });
    }
    expect(Math.max(...wobbleXs) - Math.min(...wobbleXs)).toBeGreaterThan(0.4);
    expect(Math.max(...wobbleXs)).toBeLessThan(18.7);

    const path = makeSim({
      level: getLevel('test-saw-path'),
      seed: 91,
      settings: { playerCount: 1 },
    });
    const pathXs: number[] = [];
    for (let i = 0; i < 160; i++) {
      path.step();
      path.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
        if (hz.kind === HazardKind.Saw) pathXs.push(t.x);
      });
    }
    expect(Math.max(...pathXs) - Math.min(...pathXs)).toBeGreaterThan(8);
  });

  it('held-weapon near-hand hit disarms (PLAN 4.9)', () => {
    expect(heldWeaponHitKind(0.9)).toBe('deflect');
    expect(heldWeaponHitKind(0.55)).toBe('deflect');
    expect(heldWeaponHitKind(0.4)).toBe('disarm');
    const sim = makeSim({ seed: 410, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    b.set(Transform, { x: 12.2, y: 4, angle: 0 });
    b.set(Aim, { x: 1, y: 0, holdTicks: 12 });
    const spear = spawnWeapon(sim.ecs, 'spear', 12.2, 5);
    spear.add(Held(), HeldBy(b));
    spear.remove(Loose);
    const kind = heldWeaponIntercept(sim.ecs, 12.55, 3.5, 12.55, 4.5, a);
    expect(kind).toBe('disarm');
    expect(spear.has(Held)).toBe(false);
    expect(spear.has(Loose)).toBe(true);
  });

  it('snake HP scales to match HP; giant snakes are 2× (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 411, settings: { playerCount: 1, maxHp: 50 } });
    spawnSnake(sim.ecs, 8, 5, undefined, false, false);
    spawnSnake(sim.ecs, 10, 5, undefined, true, false);
    const hps: number[] = [];
    let giantHp = 0;
    sim.ecs.query(Snake).updateEach(([s]) => {
      hps.push(s.hp);
      if (s.giant) giantHp = s.hp;
    });
    expect(hps).toContain(50);
    expect(giantHp).toBe(100);
  });

  it('rolling and dropping spikeballs move without a hang joint', () => {
    const roll = makeSim({
      level: getLevel('test-spikeball-roll'),
      seed: 91,
      settings: { playerCount: 1 },
    });
    const x0 = { n: 0 };
    roll.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) x0.n = t.x;
    });
    for (let i = 0; i < 50; i++) roll.step();
    let x1 = x0.n;
    roll.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) x1 = t.x;
    });
    expect(Math.abs(x1 - x0.n)).toBeGreaterThan(0.3);

    const drop = makeSim({
      level: getLevel('test-spikeball-drop'),
      seed: 92,
      settings: { playerCount: 1 },
    });
    const y0 = { n: 0 };
    drop.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) y0.n = t.y;
    });
    for (let i = 0; i < 40; i++) drop.step();
    let y1 = y0.n;
    drop.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) y1 = t.y;
    });
    expect(y1).toBeLessThan(y0.n - 0.4);
  });

  it('snakes hop toward a distant player (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 412, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 16, y: 4 });
    p.set(Transform, { x: 16, y: 4, angle: 0 });
    spawnSnake(sim.ecs, 8, 4, undefined, false, false);
    let hopped = false;
    for (let i = 0; i < 20; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      sim.ecs.query(Snake).updateEach((_, e) => {
        if ((sim.ctx.bodies.get(e)?.getLinearVelocity().y ?? 0) > 2) hopped = true;
      });
    }
    expect(hopped).toBe(true);
  });

  it('flying snakes ignore gravity and chase in 2D (PLAN 4.14 / Appendix C)', () => {
    const sim = makeSim({ seed: 413, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 8, y: 10 });
    p.set(Transform, { x: 8, y: 10, angle: 0 });
    spawnSnake(sim.ecs, 8, 4, undefined, false, true);
    let scale = 1;
    sim.ecs.query(Snake).updateEach((_, e) => {
      scale = sim.ctx.bodies.get(e)?.getGravityScale() ?? 1;
    });
    expect(scale).toBe(0);
    const y0 = { n: 4 };
    sim.ecs.query(Snake, Transform).updateEach(([_s, t]) => {
      y0.n = t.y;
    });
    for (let i = 0; i < 40; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let y1 = y0.n;
    sim.ecs.query(Snake, Transform).updateEach(([_s, t]) => {
      y1 = t.y;
    });
    expect(y1).toBeGreaterThan(y0.n + 0.8);
  });

  it('snakes bite on capsule contact, not a center-to-center disk (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 415, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    pin(sim, p, 12, 3);
    p.set(Health, { hp: 8, maxHp: 100 });
    spawnSnake(sim.ecs, 12.35, 2.15, undefined, false, false);
    let hit = false;
    for (let i = 0; i < 8; i++) {
      pin(sim, p, 12, 3);
      const ev = sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'hit') || (p.get(Health)?.hp ?? 8) < 8) hit = true;
    }
    expect(hit).toBe(true);
    expect(p.get(Health)?.hp ?? 8).toBeLessThanOrEqual(3);
  });

  it('a blocked snake bite emits block and deals no damage (PLAN M3 / 4.14)', () => {
    const sim = makeSim({ seed: 416, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    pin(sim, p, 12, 3);
    const combat = p.get(Combat);
    if (combat) p.set(Combat, { ...combat, blocking: true, blockMeter: 1, blockStartTick: 0 });
    const hp0 = p.get(Health)?.hp ?? 100;
    spawnSnake(sim.ecs, 11.5, 2.15, undefined, false, false);
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      pin(sim, p, 12, 3);
      const ev = sim.step([hold({ block: true, aimX: -1, aimY: 0 }), hold({}), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'block')) blocked = true;
    }
    expect(blocked).toBe(true);
    expect(p.get(Health)?.hp ?? 100).toBe(hp0);
  });

  it('bullets reduce snake HP (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 417, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    pin(sim, p, 8, 4);
    spawnSnake(sim.ecs, 12, 4, undefined, false, false);
    const gun = spawnWeapon(sim.ecs, 'pistol', 8, 5);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    const hp0 = { n: 0 };
    sim.ecs.query(Snake, Health).updateEach(([_s, h]) => {
      hp0.n = h.hp;
    });
    expect(hp0.n).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) {
      pin(sim, p, 8, 4);
      sim.ecs.query(Snake).updateEach((_, e) => {
        sim.ctx.bodies.get(e)?.setPosition({ x: 12, y: 4 });
        sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
        e.set(Transform, { x: 12, y: 4, angle: 0 });
      });
      sim.step([hold({ attack: i === 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    const hp1 = { n: hp0.n };
    sim.ecs.query(Snake, Health).updateEach(([_s, h]) => {
      hp1.n = h.hp;
    });
    expect(hp1.n).toBeLessThan(hp0.n);
  });

  it('black hole swallows a player who enters the core', () => {
    const sim = makeSim({ seed: 414, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 8, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12, y: 4 });
    a.set(Transform, { x: 8, y: 4, angle: 0 });
    b.set(Transform, { x: 12, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'black-hole', 8, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    sim.ecs.query(Projectile).updateEach(([p], e) => {
      p.vx = 0;
      p.vy = 0;
      p.x = 12;
      p.y = 4;
      p.fuse = 20;
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
      sim.ctx.bodies.get(e)?.setPosition({ x: 12, y: 4 });
    });
    sim.ctx.bodies.get(b)?.setPosition({ x: 12, y: 4 });
    b.set(Transform, { x: 12, y: 4, angle: 0 });
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(b.has(Dead) || (b.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('owner grace skips the shooter for 6 ticks then can hit', () => {
    const sim = makeSim({ seed: 901, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    pin(sim, a, 10, 4);
    const spawnThrough = (grace: number) => {
      const t = a.get(Transform)!;
      const proj = sim.ecs.spawn(
        Projectile({
          kind: ProjectileKind.Bullet,
          damage: 25,
          speed: 28,
          bounces: 0,
          fuse: 0,
          x: t.x - 1.6,
          y: t.y,
          vx: 28,
          vy: 0,
          gravity: 0,
          ownerGrace: grace,
          defId: weaponIndex('pistol'),
        }),
        OwnedBy(a),
      );
      return proj;
    };
    const hp0 = a.get(Health)!.hp;
    spawnThrough(6);
    for (let i = 0; i < 6; i++) {
      pin(sim, a, 10, 4);
      sim.step([hold({}), hold({}), hold({}), hold({})]);
    }
    expect(a.get(Health)!.hp).toBe(hp0);
    spawnThrough(0);
    pin(sim, a, 10, 4);
    for (let i = 0; i < 4; i++) {
      pin(sim, a, 10, 4);
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if ((a.get(Health)?.hp ?? hp0) < hp0) break;
    }
    expect(a.get(Health)!.hp).toBeLessThan(hp0);
  });

  it('block meter drains over 72 ticks, waits 18, then refills over 60', () => {
    const sim = makeSim({ seed: 902, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    for (let i = 0; i < 72; i++) sim.step([hold({ block: true }), hold({}), hold({}), hold({})]);
    expect(p.get(Combat)!.blockMeter).toBeLessThan(0.05);
    const empty = p.get(Combat)!.blockMeter;
    for (let i = 0; i < 18; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.get(Combat)!.blockMeter).toBeCloseTo(empty, 2);
    for (let i = 0; i < 60; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.get(Combat)!.blockMeter).toBeGreaterThan(0.95);
  });

  it('sniper headshot at 100 HP is a kill (75 × 2)', () => {
    const sim = makeSim({ seed: 903, settings: { playerCount: 1, maxHp: 100 } });
    const p = playerOf(sim);
    expect(p.get(Health)?.hp).toBe(100);
    takeDamage(sim.ecs, p, 75, 'head', -1, 0, 0);
    expect(p.get(Health)?.hp).toBe(0);
  });

  it('rare drops weigh less than a common pistol', () => {
    const pistol = WEAPON_DEFS.find((d) => d.id === 'pistol')!.dropWeight;
    expect(WEAPON_DEFS.find((d) => d.id === 'god-pistol')!.dropWeight).toBeLessThan(pistol);
    expect(WEAPON_DEFS.find((d) => d.id === 'rpg')!.dropWeight).toBeLessThan(pistol);
    expect(WEAPON_DEFS.find((d) => d.id === 'black-hole')!.dropWeight).toBeLessThan(pistol);
    expect(pistol).toBe(1);
  });

  it('barrel blast is 10–55, nearer heavier than farther', () => {
    const blast = (offset: number) => {
      const sim = makeSim({
        level: getLevel('test-barrel.explosive'),
        seed: 904,
        settings: { playerCount: 1 },
      });
      const p = playerOf(sim);
      const barrel = getLevel('test-barrel.explosive').objects.find((o) => o.type === 'barrel.explosive');
      const x = (barrel?.x ?? 13) + offset;
      const y = barrel?.y ?? 3;
      sim.ctx.bodies.get(p)?.setPosition({ x, y });
      p.set(Transform, { x, y, angle: 0 });
      const hp0 = p.get(Health)!.hp;
      sim.ecs.query(Destructible).updateEach(([d]) => {
        d.hp = 0;
      });
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      return hp0 - (p.get(Health)?.hp ?? hp0);
    };
    const dmgN = blast(0.2);
    const dmgF = blast(1.8);
    expect(dmgN).toBeGreaterThanOrEqual(10);
    expect(dmgN).toBeLessThanOrEqual(55);
    expect(dmgF).toBeGreaterThanOrEqual(10);
    expect(dmgF).toBeLessThanOrEqual(55);
    expect(dmgN).toBeGreaterThan(dmgF);
  });
});
