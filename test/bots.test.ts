import { describe, expect, it } from 'vitest';
import { bulletApproaching, hazardAhead } from '../src/sim/ai/bots';
import { getLevel } from '../src/levels/catalog';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Bot, Held, HeldBy, Projectile, Transform, Weapon } from '../src/sim/traits';
import { makeSim, pin, playerOf } from './helpers';

describe('M9 bots', () => {
  it('a human seat past playerCount is not tagged as a bot', () => {
    const sim = makeSim({
      seed: 89,
      settings: { playerCount: 1, bots: 3 },
      seats: [
        { slot: 0, color: 0, inputIndex: 0 },
        { slot: 1, color: 1, inputIndex: 1 },
      ],
    });
    expect(playerOf(sim, 0).has(Bot)).toBe(false);
    expect(playerOf(sim, 1).has(Bot)).toBe(false);
    expect(playerOf(sim, 2).has(Bot)).toBe(true);
    expect(playerOf(sim, 3).has(Bot)).toBe(true);
  });

  it('createSimWorld attaches Bot traits for settings.bots seats', () => {
    const sim = makeSim({ seed: 90, settings: { playerCount: 1, bots: 3 } });
    let bots = 0;
    sim.ecs.query(Bot).updateEach(() => {
      bots += 1;
    });
    expect(bots).toBe(3);
  });

  it('bots produce non-idle inputs and move toward a living player', () => {
    const sim = makeSim({ seed: 91, settings: { playerCount: 1, bots: 3 } });
    const human = playerOf(sim, 0);
    sim.ctx.bodies.get(human)?.setPosition({ x: 8, y: 4 });
    human.set(Transform, { x: 8, y: 4, angle: 0 });
    const bot = playerOf(sim, 1);
    sim.ctx.bodies.get(bot)?.setPosition({ x: 16, y: 4 });
    bot.set(Transform, { x: 16, y: 4, angle: 0 });
    const x0 = bot.get(Transform)?.x ?? 16;
    for (let i = 0; i < 90; i++) sim.step();
    const x1 = bot.get(Transform)?.x ?? 16;
    expect(Math.abs(x1 - x0)).toBeGreaterThan(0.3);
    expect(sim.getTick()).toBe(90);
  });

  it('unarmed bot walks toward the nearest loose weapon and picks it up (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 95, settings: { playerCount: 1, bots: 1 } });
    const bot = playerOf(sim, 1);
    pin(sim, bot, 13.6, 4);
    const gun = spawnWeapon(sim.ecs, 'pistol', 12, 4);
    const w = gun.get(Weapon)!;
    gun.set(Weapon, { ...w, pickupCooldown: 0 });
    const x0 = bot.get(Transform)?.x ?? 13.6;
    for (let i = 0; i < 50; i++) sim.step();
    expect(bot.get(Transform)?.x ?? 13.6).toBeLessThan(x0);
    expect(gun.has(Held)).toBe(true);
    expect(gun.targetFor(HeldBy) === bot).toBe(true);
  });

  it('thinkBots raises block when a bullet is approaching, not on a periodic tick', () => {
    const sim = makeSim({ seed: 96, settings: { playerCount: 1, bots: 1 } });
    const bot = playerOf(sim, 1);
    pin(sim, bot, 14, 4);
    const trait = bot.get(Bot);
    if (trait) bot.set(Bot, { ...trait, think: 20 });
    sim.ecs.spawn(
      Projectile({
        kind: 0,
        damage: 10,
        speed: 40,
        bounces: 0,
        fuse: 0,
        x: 8,
        y: 4,
        vx: 40,
        vy: 0,
        gravity: 0,
        ownerGrace: 0,
        defId: 0,
      }),
    );
    sim.step();
    const slot = bot.get(Bot)?.slot ?? 1;
    expect(sim.ctx.inputs[slot]?.block).toBe(true);
  });

  it('blocks when a bullet is approaching (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 92, settings: { playerCount: 1, bots: 1 } });
    sim.ecs.spawn(
      Projectile({
        kind: 0,
        damage: 10,
        speed: 40,
        bounces: 0,
        fuse: 0,
        x: 8,
        y: 4,
        vx: 40,
        vy: 0,
        gravity: 0,
        ownerGrace: 0,
        defId: 0,
      }),
    );
    expect(bulletApproaching(sim.ecs, 14, 4)).toBe(true);
    expect(bulletApproaching(sim.ecs, 8, 10)).toBe(false);
  });

  it('avoids lava / pits in the look-ahead (PLAN 4.14)', () => {
    const sim = makeSim({
      level: getLevel('test-lava'),
      seed: 94,
      settings: { playerCount: 1, bots: 1 },
    });
    const lava = getLevel('test-lava').objects.find((o) => o.type === 'lava');
    const x = lava?.x ?? 16;
    const y = (lava?.y ?? 1.6) + 1.2;
    expect(hazardAhead(sim.ecs, x - 1.4, y, 1)).toBe(true);
    expect(hazardAhead(sim.ecs, 4, 3.2, 1)).toBe(false);
  });

  it('bot soak of 2000 ticks stays finite', { timeout: 30_000 }, () => {
    const sim = makeSim({ seed: 93, settings: { playerCount: 1, bots: 3 }, boxes: 4 });
    expect(() => {
      for (let i = 0; i < 2000; i++) sim.step();
    }).not.toThrow();
    sim.ecs.query(Transform).updateEach(([t]) => {
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
    });
  });
});
