import { describe, expect, it } from 'vitest';
import {
  bulletApproaching,
  hazardAhead,
  nearerWallDir,
  shouldClimb,
  wallToward,
} from '../src/sim/ai/bots';
import { getLevel } from '../src/levels/catalog';
import { spawnWeapon } from '../src/sim/systems/weapons';
import {
  Bot,
  Combat,
  Controller,
  Dead,
  Health,
  Held,
  HeldBy,
  Loose,
  Projectile,
  Transform,
  Weapon,
} from '../src/sim/traits';
import { gymLevel, makeSim, pin, playerOf, woodsClearing } from './helpers';

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

  it('thinkBots does not raise block on an attack tick without a closing bullet', () => {
    const sim = makeSim({ seed: 96, settings: { playerCount: 1, bots: 1 } });
    const bot = playerOf(sim, 1);
    pin(sim, bot, 14, 4);
    const trait = bot.get(Bot);
    if (trait) bot.set(Bot, { ...trait, think: 20 });
    sim.step();
    const slot = bot.get(Bot)?.slot ?? 1;
    // think becomes 21; 21 % 18 < 6 would also fire attack — block must stay off.
    expect(sim.ctx.inputs[slot]?.block).toBe(false);
  });

  it('thinkBots raises block only for a closing bullet, not a receding one', () => {
    const run = (vx: number) => {
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
          vx,
          vy: 0,
          gravity: 0,
          ownerGrace: 0,
          defId: 0,
        }),
      );
      sim.step();
      return sim.ctx.inputs[bot.get(Bot)?.slot ?? 1]?.block;
    };
    expect(run(-40)).toBe(false);
    expect(run(40)).toBe(true);
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
    expect(bulletApproaching(sim.ecs, 2, 4)).toBe(false);
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

  it('retreats when too close while armed (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 97, settings: { playerCount: 1, bots: 1 } });
    const human = playerOf(sim, 0);
    const bot = playerOf(sim, 1);
    pin(sim, human, 10, 4);
    pin(sim, bot, 10.35, 4);
    const gun = spawnWeapon(sim.ecs, 'pistol', 10.35, 4);
    gun.add(Held(), HeldBy(bot));
    gun.remove(Loose);
    sim.step();
    const slot = bot.get(Bot)?.slot ?? 1;
    expect(sim.ctx.inputs[slot]?.moveX).toBeGreaterThan(0);
    expect(sim.ctx.inputs[slot]?.attack).toBe(false);
  });

  it('retreats when HP is low even at mid range (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 99, settings: { playerCount: 1, bots: 1 } });
    const human = playerOf(sim, 0);
    const bot = playerOf(sim, 1);
    pin(sim, human, 10, 4);
    pin(sim, bot, 14, 4);
    bot.set(Health, { hp: 20, maxHp: 100 });
    sim.step();
    const slot = bot.get(Bot)?.slot ?? 1;
    expect(sim.ctx.inputs[slot]?.moveX).toBeGreaterThan(0);
    expect(sim.ctx.inputs[slot]?.attack).toBe(false);
  });

  it('shouldClimb requires a wall and either air or dy > 1', () => {
    expect(shouldClimb({ grounded: true, dy: 1.15, wall: true })).toBe(true);
    expect(shouldClimb({ grounded: true, dy: 0.4, wall: true })).toBe(false);
    expect(shouldClimb({ grounded: false, dy: 0.2, wall: true })).toBe(true);
    expect(shouldClimb({ grounded: true, dy: 1.15, wall: false })).toBe(false);
  });

  it('nearerWallDir presses into the closer shaft wall (PLAN 4.14)', () => {
    const sim = makeSim({
      level: gymLevel,
      seed: 98,
      settings: { playerCount: 1, bots: 1 },
    });
    expect(nearerWallDir(sim.ecs, 4.7, 3.2)).toBe(1);
    expect(nearerWallDir(sim.ecs, 3.3, 3.2)).toBe(-1);
    expect(nearerWallDir(sim.ecs, 16, 3.2)).toBe(0);
  });

  it('wall-jumps into a shaft wall when generic jump would not fire (PLAN 4.14)', () => {
    const sim = makeSim({
      level: gymLevel,
      seed: 98,
      settings: { playerCount: 1, bots: 1 },
    });
    const human = playerOf(sim, 0);
    const bot = playerOf(sim, 1);
    // 1 < dy ≤ 1.2 and |dx| ≤ 3 so the generic jump heuristic stays off.
    pin(sim, human, 5.0, 4.35);
    pin(sim, bot, 4.7, 3.2);
    const ctrl = bot.get(Controller);
    if (ctrl) bot.set(Controller, { ...ctrl, grounded: true, facing: 1 });
    const trait = bot.get(Bot);
    if (trait) bot.set(Bot, { ...trait, think: 20 });
    expect(wallToward(sim.ecs, 4.7, 3.2, 1)).toBe(true);
    sim.step();
    const slot = bot.get(Bot)?.slot ?? 1;
    expect(sim.ctx.inputs[slot]?.jump).toBe(true);
    expect(sim.ctx.inputs[slot]?.moveX ?? 0).toBeGreaterThan(0.2);
  });

  it('does not climb-jump the same pose when no wall is toward the target', () => {
    const sim = makeSim({
      level: woodsClearing,
      seed: 98,
      settings: { playerCount: 1, bots: 1 },
    });
    const human = playerOf(sim, 0);
    const bot = playerOf(sim, 1);
    pin(sim, human, 16.3, 4.35);
    pin(sim, bot, 16, 3.2);
    const ctrl = bot.get(Controller);
    if (ctrl) bot.set(Controller, { ...ctrl, grounded: true, facing: 1 });
    const trait = bot.get(Bot);
    if (trait) bot.set(Bot, { ...trait, think: 20 });
    expect(wallToward(sim.ecs, 16, 3.2, 1)).toBe(false);
    sim.step();
    const slot = bot.get(Bot)?.slot ?? 1;
    expect(sim.ctx.inputs[slot]?.jump).toBe(false);
  });

  it('mid-shaft climb is not reversed by a false pit miss (PLAN 4.14)', () => {
    const sim = makeSim({
      level: gymLevel,
      seed: 98,
      settings: { playerCount: 1, bots: 1 },
    });
    const human = playerOf(sim, 0);
    const bot = playerOf(sim, 1);
    pin(sim, human, 4.9, 10);
    pin(sim, bot, 4.7, 7);
    const ctrl = bot.get(Controller);
    if (ctrl) bot.set(Controller, { ...ctrl, grounded: false, facing: 1 });
    const trait = bot.get(Bot);
    if (trait) bot.set(Bot, { ...trait, think: 20 });
    expect(hazardAhead(sim.ecs, 4.7, 7, 1)).toBe(true);
    expect(hazardAhead(sim.ecs, 4.7, 7, 1, { checkPit: false })).toBe(false);
    sim.step();
    const slot = bot.get(Bot)?.slot ?? 1;
    expect(sim.ctx.inputs[slot]?.jump).toBe(true);
    expect(sim.ctx.inputs[slot]?.moveX ?? 0).toBeGreaterThan(0.2);
  });

  it('a bot in the gym shaft wall-climbs past a single jump (PLAN 4.14 / M1)', () => {
    const sim = makeSim({
      level: gymLevel,
      seed: 101,
      settings: { playerCount: 1, bots: 1 },
    });
    const human = playerOf(sim, 0);
    const bot = playerOf(sim, 1);
    pin(sim, bot, 4.7, 3.2);
    const y0 = bot.get(Transform)?.y ?? 3.2;
    let apex = y0;
    let wallJumps = 0;
    let prevLock = 0;
    for (let i = 0; i < 360; i++) {
      pin(sim, human, 4.9, 12);
      sim.step();
      apex = Math.max(apex, bot.get(Transform)?.y ?? apex);
      const lock = bot.get(Controller)?.lockTicks ?? 0;
      if (lock > prevLock) wallJumps += 1;
      prevLock = lock;
    }
    // One floor jump is ≈2.0 m; M1 shaft climb is 6 tiles (y ≥ 8.5).
    expect(apex).toBeGreaterThan(y0 + 4);
    expect(apex).toBeGreaterThanOrEqual(8.5);
    expect(wallJumps).toBeGreaterThanOrEqual(2);
  });

  it('a bot actually blocks a live incoming bullet (PLAN 4.14)', () => {
    const sim = makeSim({ seed: 102, settings: { playerCount: 1, bots: 1 } });
    const human = playerOf(sim, 0);
    const bot = playerOf(sim, 1);
    pin(sim, human, 2, 4);
    pin(sim, bot, 14, 4);
    const trait = bot.get(Bot);
    if (trait) bot.set(Bot, { ...trait, think: 20 });
    sim.ecs.spawn(
      Projectile({
        kind: 0,
        damage: 40,
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
    const hp0 = bot.get(Health)?.hp ?? 100;
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      pin(sim, human, 2, 4);
      pin(sim, bot, 14, 4);
      const ev = sim.step();
      if (ev.some((e) => e.type === 'block')) blocked = true;
    }
    expect(bot.get(Combat)?.blocking || blocked).toBe(true);
    expect(blocked).toBe(true);
    expect(bot.get(Health)?.hp ?? 100).toBe(hp0);
    expect(bot.has(Dead)).toBe(false);
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
