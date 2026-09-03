import { describe, expect, it } from 'vitest';
import { gymLevel, runTrack } from '../src/levels/gym';
import { REACH, validateLevel } from '../src/levels/validate';
import { Controller, Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf, pos, stepMany } from './helpers';

describe('M1 movement', () => {
  it('normal jump apex is ~1.6× height (±10%)', () => {
    const sim = makeSim({ level: gymLevel, seed: 2 });
    stepMany(sim, 40);
    const start = pos(sim).y;
    const e = playerOf(sim);
    let jumped = false;
    let apex = start;
    for (let i = 0; i < 90; i++) {
      const ctrl = e.get(Controller);
      const jump = !jumped && !!ctrl?.grounded;
      if (jump) jumped = true;
      sim.step([hold({ jump }), hold({}), hold({}), hold({})]);
      apex = Math.max(apex, e.get(Transform)?.y ?? apex);
    }
    const rise = apex - start;
    expect(rise).toBeGreaterThan(1.8 * 1.6 * 0.9);
    expect(rise).toBeLessThan(1.8 * 1.6 * 1.15);
  });

  it('punch jump is higher than a normal jump', () => {
    const normal = jumpRise(false, false);
    const punch = jumpRise(true, false);
    expect(punch).toBeGreaterThan(normal * 1.15);
  });

  it('block punch jump is the highest', () => {
    const punch = jumpRise(true, false);
    const blockPunch = jumpRise(true, true);
    expect(blockPunch).toBeGreaterThan(punch * 1.05);
  });

  it('climbs a 6-tile shaft in <= 4 wall jumps', () => {
    const sim = makeSim({ level: gymLevel, seed: 3, settings: { playerCount: 1 } });
    const e = playerOf(sim);
    const body = sim.ctx.bodies.get(e);
    body?.setPosition({ x: 3.2, y: 3.2 });
    body?.setLinearVelocity({ x: 0, y: 0 });
    let wallJumps = 0;
    let prevLock = 0;
    for (let i = 0; i < 300; i++) {
      const ctrl = e.get(Controller);
      const sliding = ctrl?.wallSliding ?? false;
      const jump = sliding || i < 8;
      const lock = ctrl?.lockTicks ?? 0;
      if (lock > prevLock) wallJumps += 1;
      prevLock = lock;
      sim.step([hold({ moveX: -1, jump, aimX: -1, aimY: 0.2 }), hold({}), hold({}), hold({})]);
      if ((e.get(Transform)?.y ?? 0) >= 8.5) break;
    }
    expect(e.get(Transform)?.y ?? 0).toBeGreaterThanOrEqual(8.5);
    expect(wallJumps).toBeLessThanOrEqual(4);
  });

  it('falling past a ledge over a pit, holding towards it and jumping gets you onto it (no wall-kick loop)', () => {
    // A slab over nothing: the fighter drops beside its face, pushes into it and taps jump whenever
    // sliding. The old wide wall-kick arc came back below the lip every time and looped forever.
    const slab = { ...runTrack, id: 'slab', objects: [{ type: 'solid' as const, x: 18, y: 6.5, w: 8, h: 3 }] };
    for (const thickness of [3, 0.4]) {
      const level = { ...slab, objects: [{ type: 'solid' as const, x: 18, y: 8 - thickness / 2, w: 8, h: thickness }] };
      const sim = makeSim({ level, seed: 7, settings: { playerCount: 1 } });
      const e = playerOf(sim);
      sim.ctx.bodies.get(e)?.setPosition({ x: 13.5, y: 7.6 });
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
      let landedAt = -1;
      let wallJumps = 0;
      let prevLock = 0;
      for (let i = 0; i < 180 && landedAt < 0; i++) {
        const ctrl = e.get(Controller)!;
        if (ctrl.lockTicks > prevLock) wallJumps += 1;
        prevLock = ctrl.lockTicks;
        sim.step([hold({ moveX: 1, jump: ctrl.wallSliding }), hold({}), hold({}), hold({})]);
        const t = e.get(Transform)!;
        if (ctrl.grounded && t.y > 8.5 && t.x > 14) landedAt = i;
        expect(t.y).toBeGreaterThan(0); // never fell into the pit
      }
      expect(landedAt, `thickness ${thickness}: landed`).toBeGreaterThan(0);
      expect(landedAt, `thickness ${thickness}: quickly`).toBeLessThan(90);
      expect(wallJumps, `thickness ${thickness}: kicks`).toBeLessThanOrEqual(2);
    }
  });

  it('a jump that comes up just short of a lip scrambles onto it', () => {
    // Feet arrive ~0.4 m below the top of a 3.5 m step (a standing jump apexes at ~3.1 m): the ledge
    // assist tops the jump up rather than letting the fighter bonk the lip and drop. Jump is tapped,
    // not held, so no wall-kick is involved.
    const top = 2 + 3.5;
    const level = { ...runTrack, id: 'step', objects: [...runTrack.objects, { type: 'solid' as const, x: 22, y: top - 1.75, w: 6, h: 3.5 }] };
    const sim = makeSim({ level, seed: 8, settings: { playerCount: 1 } });
    const e = playerOf(sim);
    sim.ctx.bodies.get(e)?.setPosition({ x: 17.9, y: 2.9 });
    stepMany(sim, 20);
    let landed = false;
    let kicks = 0;
    for (let i = 0; i < 120 && !landed; i++) {
      sim.step([hold({ moveX: 1, jump: i < 3 }), hold({}), hold({}), hold({})]);
      const t = e.get(Transform)!;
      const ctrl = e.get(Controller)!;
      if (ctrl.lockTicks > 0) kicks += 1;
      if (ctrl.grounded && t.y > top + 0.8 && t.x > 19) landed = true;
    }
    expect(kicks).toBe(0);
    expect(landed).toBe(true);
  });

  it('strolls under a platform hung with HEADROOM of air, then hops onto it in one jump', () => {
    // A thin platform placed the way the generator does: HEADROOM above the floor, PLAT_T thick,
    // so its top is a MAX_RISE-class ledge (2.6 m). Both halves of that promise must hold.
    const top = 2 + REACH.HEADROOM + 0.4;
    const level = {
      ...runTrack,
      id: 'headroom',
      objects: [...runTrack.objects, { type: 'solid' as const, x: 20, y: top - 0.2, w: 6, h: 0.4 }],
    };
    expect(validateLevel(level)).toEqual([]);
    const sim = makeSim({ level, seed: 5, settings: { playerCount: 1 } });
    const e = playerOf(sim);
    sim.ctx.bodies.get(e)?.setPosition({ x: 12, y: 3.2 });
    stepMany(sim, 30);
    // Walk right, straight under the platform (x 17–23) and out the other side.
    let minY = Infinity;
    for (let i = 0; i < 150; i++) {
      sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
      const t = e.get(Transform)!;
      if (t.x > 17.5 && t.x < 22.5) minY = Math.min(minY, t.y);
    }
    expect(pos(sim).x).toBeGreaterThan(24);
    expect(minY).toBeCloseTo(2.9, 0); // stayed on the floor: never bumped or got stuck
    // Now from the floor beside it, jump up onto it.
    sim.ctx.bodies.get(e)?.setPosition({ x: 15.5, y: 2.9 });
    sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
    stepMany(sim, 20);
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      sim.step([hold({ moveX: 1, jump: i < 12 }), hold({}), hold({}), hold({})]);
      const t = e.get(Transform)!;
      if (e.get(Controller)?.grounded && t.y > top + 0.5 && t.x > 17) landed = true;
    }
    expect(landed).toBe(true);
  });

  it('runs ~30 m in about 4 seconds', () => {
    const sim = makeSim({ level: runTrack, seed: 4, settings: { playerCount: 1 } });
    const e = playerOf(sim);
    sim.ctx.bodies.get(e)?.setPosition({ x: 4, y: 3.2 });
    stepMany(sim, 40);
    const start = pos(sim).x;
    stepMany(sim, 240, hold({ moveX: 1 }));
    const dist = pos(sim).x - start;
    expect(dist).toBeGreaterThan(26);
    expect(dist).toBeLessThan(36);
  });
});

function jumpRise(punch: boolean, block: boolean): number {
  const sim = makeSim({ seed: punch ? 11 : 10 });
  stepMany(sim, 30);
  const e = playerOf(sim);
  const start = e.get(Transform)?.y ?? 0;
  let jumped = false;
  let apex = start;
  for (let i = 0; i < 90; i++) {
    const grounded = e.get(Controller)?.grounded;
    const jump = !jumped && grounded;
    if (jump) jumped = true;
    sim.step([
      hold({ jump, attack: punch && jump, block, aimX: 0, aimY: 1 }),
      hold({}),
      hold({}),
      hold({}),
    ]);
    apex = Math.max(apex, e.get(Transform)?.y ?? apex);
  }
  return apex - start;
}
