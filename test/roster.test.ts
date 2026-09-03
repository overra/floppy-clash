import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Combat, Dead, Health, Held, HeldBy, Loose, Projectile, Snake, Transform, Weapon } from '../src/sim/traits';
import { WEAPON_DEFS } from '../src/sim/weapons/defs';
import type { WeaponDef } from '../src/sim/weapons/schema';
import { hold, makeSim, pin, playerOf } from './helpers';

const DROPPABLE = WEAPON_DEFS.filter((d) => d.dropWeight > 0);

function arm(sim: ReturnType<typeof makeSim>, defId: string, holder: ReturnType<typeof playerOf>, x: number, y: number) {
  const gun = spawnWeapon(sim.ecs, defId, x, y);
  gun.add(Held(), HeldBy(holder));
  gun.remove(Loose);
  return gun;
}

function faceOff(
  def: WeaponDef,
  seed: number,
  opts: { hp?: number; ax?: number; bx?: number; ay?: number; by?: number },
) {
  const sim = makeSim({
    level: woodsClearing,
    seed,
    settings: { playerCount: 2 },
  });
  const a = playerOf(sim, 0);
  const b = playerOf(sim, 1);
  const ax = opts.ax ?? 10;
  const ay = opts.ay ?? 3;
  const bx = opts.bx ?? 12;
  const by = opts.by ?? 3;
  pin(sim, a, ax, ay);
  pin(sim, b, bx, by);
  if (opts.hp != null) b.set(Health, { hp: opts.hp, maxHp: 100 });
  const gun = arm(sim, def.id, a, ax, ay);
  return { sim, a, b, gun, ax, ay, bx, by };
}

function killGap(def: WeaponDef): { ax: number; bx: number } {
  if (def.id === 'blink-dagger') return { ax: 10, bx: 14 };
  if (def.projectile.kind === 'beam') return { ax: 10, bx: 13.5 };
  if (def.projectile.kind === 'melee') return { ax: 10, bx: 10.55 };
  if (def.projectile.kind === 'creature') return { ax: 10, bx: 12.2 };
  return { ax: 10, bx: 10 + 1.2 + def.shape.length * 0.35 };
}

function fireHeld(def: WeaponDef, i: number, fireUntil = 10): boolean {
  if (def.fireMode === 'semi' || def.fireMode === 'burst') return i === 1;
  return i >= 1 && i < fireUntil;
}

function snapProjectileOnto(sim: ReturnType<typeof makeSim>, x: number, y: number, fuse = 3): void {
  sim.ecs.query(Projectile).updateEach(([p], e) => {
    if (p.fuse > fuse) p.fuse = fuse;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    sim.ctx.bodies.get(e)?.setPosition({ x, y });
    sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
  });
}

describe('M6 roster', () => {
  it('every droppable weapon can kill from its own fire (not a throw or a block)', () => {
    expect(DROPPABLE.length).toBeGreaterThanOrEqual(30);
    for (const def of DROPPABLE) {
      const { ax, bx } = killGap(def);
      const { sim, a, b } = faceOff(def, 400 + def.id.length, { hp: 5, ax, bx });
      let killed = false;
      const delayed =
        def.projectile.kind === 'grenade' ||
        def.projectile.kind === 'rocket' ||
        def.projectile.kind === 'burst-into' ||
        (def.projectile.kind === 'field' && def.id !== 'flamethrower' && def.id !== 'glue-gun');
      const needsSnake = def.projectile.kind === 'creature' || def.id === 'snake-grenade';
      let sawSnake = false;
      const ticks =
        def.projectile.kind === 'beam'
          ? 70
          : def.projectile.kind === 'creature'
            ? 70
            : def.id === 'flamethrower'
              ? 90
              : delayed
                ? 50
                : 24;
      for (let i = 0; i < ticks; i++) {
        pin(sim, a, ax, 3);
        pin(sim, b, bx, 3);
        if (delayed && i === 8 && !b.has(Dead)) {
          const bt = b.get(Transform) ?? { x: bx, y: 3 };
          snapProjectileOnto(sim, bt.x, bt.y, def.id === 'black-hole' ? 20 : def.id === 'thruster' ? 2 : 3);
        }
        const ev = sim.step([
          hold({ attack: fireHeld(def, i, 20), aimX: 1, aimY: 0 }),
          hold({}),
          hold({}),
          hold({}),
        ]);
        if (needsSnake) {
          sim.ecs.query(Snake).updateEach(() => {
            sawSnake = true;
          });
        }
        const dead = ev.some((e) => e.type === 'kill') || b.has(Dead) || (b.get(Health)?.hp ?? 1) <= 0;
        if (dead && (!needsSnake || sawSnake)) {
          killed = true;
          break;
        }
      }
      expect(sawSnake || !needsSnake, `${def.id} snake from fire`).toBe(true);
      expect(killed, `${def.id} fire-kill`).toBe(true);
      expect(b.has(Dead) || (b.get(Health)?.hp ?? 1) <= 0, `${def.id} dead`).toBe(true);
    }
  }, 180_000);

  it('every droppable weapon applies live recoil on fire', () => {
    for (const def of DROPPABLE) {
      const sim = makeSim({ level: woodsClearing, seed: 500 + def.id.length, settings: { playerCount: 1 } });
      const p = playerOf(sim);
      pin(sim, p, 10, 4);
      arm(sim, def.id, p, 10, 5);
      sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
      sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      const v = sim.ctx.bodies.get(p)?.getLinearVelocity() ?? { x: 0, y: 0 };
      expect(Math.hypot(v.x, v.y), `${def.id} live recoil`).toBeGreaterThan(0.04);
    }
  }, 60_000);

  it('every droppable weapon can be thrown (leaves the hand as Loose)', () => {
    for (const def of DROPPABLE) {
      const sim = makeSim({ level: woodsClearing, seed: 600 + def.id.length, settings: { playerCount: 1 } });
      const p = playerOf(sim);
      pin(sim, p, 10, 4);
      const gun = arm(sim, def.id, p, 10, 5);
      const ev = sim.step([hold({ throw: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      expect(ev.some((e) => e.type === 'throw'), `${def.id} throw event`).toBe(true);
      expect(gun.has(Held), `${def.id} left hand`).toBe(false);
      expect(gun.has(Loose) && (gun.get(Weapon)?.thrown ?? false), `${def.id} loose thrown`).toBe(true);
    }
  }, 60_000);

  it('every droppable weapon is blocked: block event and no HP loss', () => {
    for (const def of DROPPABLE) {
      const { ax, bx } = killGap(def);
      const { sim, a, b } = faceOff(def, 700 + def.id.length, { hp: 40, ax, bx });
      const hp0 = b.get(Health)?.hp ?? 40;
      let blocked = false;
      const wait =
        def.projectile.kind === 'beam'
          ? 50
          : def.projectile.kind === 'creature'
            ? 50
            : 18;
      for (let i = 0; i < 12; i++) {
        pin(sim, a, ax, 3);
        pin(sim, b, bx, 3);
        sim.step([hold({ aimX: 1, aimY: 0 }), hold({ block: true, aimX: -1, aimY: 0 }), hold({}), hold({})]);
      }
      for (let i = 0; i < wait; i++) {
        pin(sim, a, ax, 3);
        pin(sim, b, bx, 3);
        const ev = sim.step([
          hold({ attack: fireHeld(def, i, 16), aimX: 1, aimY: 0 }),
          hold({ block: true, aimX: -1, aimY: 0 }),
          hold({}),
          hold({}),
        ]);
        if (ev.some((e) => e.type === 'block')) blocked = true;
      }
      expect(blocked, `${def.id} block event`).toBe(true);
      expect(b.get(Health)?.hp ?? 40, `${def.id} block holds HP`).toBe(hp0);
      expect(b.has(Dead), `${def.id} not killed through block`).toBe(false);
    }
  }, 180_000);

  it('every bullet/pellet weapon can be reflected in the perfect-block window', () => {
    const reflectable = DROPPABLE.filter(
      (d) => d.projectile.kind === 'bullet' || d.projectile.kind === 'pellets',
    );
    expect(reflectable.length).toBeGreaterThanOrEqual(8);
    for (const def of reflectable) {
      const { ax, bx } = killGap(def);
      const { sim, a, b } = faceOff(def, 800 + def.id.length, { hp: 40, ax, bx });
      const hp0 = b.get(Health)?.hp ?? 40;
      let reflected = false;
      for (let i = 0; i < 16; i++) {
        pin(sim, a, ax, 3);
        pin(sim, b, bx, 3);
        const ev = sim.step([
          hold({ attack: fireHeld(def, i, 8), aimX: 1, aimY: 0 }),
          hold({ block: i >= 1, aimX: -1, aimY: 0 }),
          hold({}),
          hold({}),
        ]);
        if (ev.some((e) => e.type === 'block' && e.reflected)) reflected = true;
      }
      expect(reflected, `${def.id} reflect`).toBe(true);
      expect(b.get(Health)?.hp ?? 40, `${def.id} reflect holds HP`).toBe(hp0);
    }
  }, 120_000);

  it('covers every projectile kind', () => {
    const kinds = new Set(WEAPON_DEFS.map((d) => d.projectile.kind));
    for (const kind of [
      'bullet',
      'pellets',
      'grenade',
      'rocket',
      'beam',
      'melee',
      'field',
      'creature',
      'burst-into',
    ]) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });

  it('melee arc and beam warning then damage', () => {
    const melee = makeSim({ level: woodsClearing, seed: 7, settings: { playerCount: 2 } });
    const a = playerOf(melee, 0);
    const b = playerOf(melee, 1);
    melee.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    melee.ctx.bodies.get(b)?.setPosition({ x: 10.7, y: 4 });
    const sword = spawnWeapon(melee.ecs, 'sword', 10, 5);
    sword.add(Held(), HeldBy(a));
    sword.remove(Loose);
    const before = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 8; i++) {
      melee.step([hold({ attack: i === 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(b.get(Health)?.hp ?? 100).toBeLessThan(before);

    const beam = makeSim({ level: woodsClearing, seed: 8, settings: { playerCount: 2 } });
    const ba = playerOf(beam, 0);
    const bb = playerOf(beam, 1);
    beam.ctx.bodies.get(ba)?.setPosition({ x: 10, y: 4 });
    beam.ctx.bodies.get(bb)?.setPosition({ x: 14, y: 4 });
    const gun = spawnWeapon(beam.ecs, 'lava-beam', 10, 5);
    gun.add(Held(), HeldBy(ba));
    gun.remove(Loose);
    const hp0 = bb.get(Health)?.hp ?? 100;
    for (let i = 0; i < 20; i++) {
      beam.step([hold({ attack: i === 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(bb.get(Health)?.hp ?? 100).toBe(hp0);
    for (let i = 0; i < 30; i++) {
      beam.step([hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(bb.get(Health)?.hp ?? 100).toBeLessThan(hp0);
  });

  it('perfect block is offered while armed (cannot fire, can punch)', () => {
    const sim = makeSim({ level: woodsClearing, seed: 9, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    const combat = p.get(Combat);
    if (combat)
      p.set(Combat, { ...combat, blocking: true, blockMeter: 1, blockStartTick: sim.ctx.tick });
    sim.step([hold({ block: true, attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(gun.get(Weapon)?.ammo).toBe(15);
  });
});
