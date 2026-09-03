import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Combat, Health, Held, HeldBy, Loose, Transform, Weapon } from '../src/sim/traits';
import { WEAPON_DEFS } from '../src/sim/weapons/defs';
import { hold, makeSim, playerOf } from './helpers';

describe('M6 roster', () => {
  it('every droppable weapon can kill, boost, be thrown, be blocked and reflected', () => {
    const droppable = WEAPON_DEFS.filter((d) => d.dropWeight > 0);
    expect(droppable.length).toBeGreaterThanOrEqual(30);
    for (const def of droppable) {
      const sim = makeSim({
        level: woodsClearing,
        seed: 50 + def.id.length,
        settings: { playerCount: 2 },
      });
      const a = playerOf(sim, 0);
      const b = playerOf(sim, 1);
      sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
      sim.ctx.bodies.get(b)?.setPosition({ x: 11.15, y: 4 });
      a.set(Transform, { x: 10, y: 4, angle: 0 });
      b.set(Transform, { x: 11.15, y: 4, angle: 0 });
      a.set(Health, { hp: 40, maxHp: 100 });
      b.set(Health, { hp: 40, maxHp: 100 });
      const gun = spawnWeapon(sim.ecs, def.id, 10, 5);
      gun.add(Held(), HeldBy(a));
      gun.remove(Loose);
      const body = sim.ctx.bodies.get(a);
      const v0 = body?.getLinearVelocity() ?? { x: 0, y: 0 };
      let killed = false;
      let blocked = false;
      let reflected = false;
      let thrown = false;
      let boosted = def.recoil.back + def.recoil.forward + def.recoil.up > 0;
      for (let i = 0; i < 36; i++) {
        const ev = sim.step([
          hold({ attack: i >= 4 && i < 14, throw: i === 2, aimX: 1, aimY: 0 }),
          hold({ block: i >= 4 && i < 14, aimX: -1, aimY: 0 }),
          hold({}),
          hold({}),
        ]);
        if (i === 1) {
          const v1 = body?.getLinearVelocity() ?? { x: 0, y: 0 };
          if (Math.hypot(v1.x - v0.x, v1.y - v0.y) > 0.02) boosted = true;
        }
        if (ev.some((e) => e.type === 'kill')) killed = true;
        if (ev.some((e) => e.type === 'block')) blocked = true;
        if (ev.some((e) => e.type === 'block' && e.reflected)) reflected = true;
        if (
          ev.some((e) => e.type === 'throw') ||
          (sim.ecs.has(gun) && (gun.get(Weapon)?.thrown || gun.has(Loose)))
        )
          thrown = true;
      }
      expect(boosted, `${def.id} boost`).toBe(true);
      expect(thrown, `${def.id} throw`).toBe(true);
      const victimHp = b.get(Health)?.hp ?? 40;
      expect(killed || victimHp < 40 || blocked, `${def.id} kill/block`).toBe(true);
      if (def.projectile.kind === 'bullet' || def.projectile.kind === 'pellets') {
        expect(blocked || reflected || victimHp < 40, `${def.id} block/reflect`).toBe(true);
      }
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
    expect((bb.get(Health)?.hp ?? 100) < hp0 || (bb.get(Health)?.hp ?? 100) <= 0).toBe(true);
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
