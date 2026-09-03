import { describe, expect, it } from 'vitest';
import { gymLevel, runTrack } from '../src/levels/gym';
import { Controller, Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf, pos, stepMany } from './helpers';

describe('M1 movement', () => {
  it('normal jump apex is ~1.1× height (±10%)', () => {
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
    expect(rise).toBeGreaterThan(1.8 * 1.1 * 0.9);
    expect(rise).toBeLessThan(1.8 * 1.1 * 1.1);
  });

  it('punch jump is higher than a normal jump', () => {
    const normal = jumpRise(false, false);
    const punch = jumpRise(true, false);
    expect(punch).toBeGreaterThan(normal * 1.15);
  });

  it('punch jump apex is ~1.5–2× height (±10%)', () => {
    const punch = jumpRise(true, false);
    expect(punch).toBeGreaterThan(1.8 * 1.5 * 0.9);
    expect(punch).toBeLessThan(1.8 * 2.0 * 1.1);
  });

  it('block punch jump is the highest', () => {
    const punch = jumpRise(true, false);
    const blockPunch = jumpRise(true, true);
    expect(blockPunch).toBeGreaterThan(punch * 1.05);
  });

  it('block punch jump apex is ~2.5–3× height (±10%)', () => {
    const blockPunch = jumpRise(true, true);
    expect(blockPunch).toBeGreaterThan(1.8 * 2.5 * 0.9);
    expect(blockPunch).toBeLessThan(1.8 * 3.0 * 1.1);
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

  it('punch slam (down + airborne punch) descends faster than a flat punch', () => {
    const flat = punchAirVy(false);
    const slam = punchAirVy(true);
    expect(slam).toBeLessThan(flat - 2);
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

  it('a grounded jump emits a jump event for SFX (PLAN M5)', () => {
    const sim = makeSim({ level: gymLevel, seed: 6, settings: { playerCount: 1 } });
    stepMany(sim, 40);
    const e = playerOf(sim);
    let jumped = false;
    for (let i = 0; i < 20; i++) {
      const jump = !jumped && !!e.get(Controller)?.grounded;
      const ev = sim.step([hold({ jump }), hold({}), hold({}), hold({})]);
      if (ev.some((e) => e.type === 'jump')) {
        jumped = true;
        break;
      }
    }
    expect(jumped).toBe(true);
  });
});

function punchAirVy(down: boolean): number {
  const sim = makeSim({ seed: down ? 41 : 40, settings: { playerCount: 1 } });
  const e = playerOf(sim);
  const ctrl = e.get(Controller);
  if (ctrl) e.set(Controller, { ...ctrl, grounded: false });
  sim.ctx.bodies.get(e)?.setPosition({ x: 14, y: 7 });
  sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
  e.set(Transform, { x: 14, y: 7, angle: 0 });
  sim.step([hold({ attack: true, down, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
  return sim.ctx.bodies.get(e)?.getLinearVelocity().y ?? 0;
}

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
