import { describe, expect, it } from 'vitest';
import { gymLevel } from '../src/levels/gym';
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
    expect(rise).toBeLessThan(1.8 * 1.1 * 1.25);
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
    const sim = makeSim({ level: gymLevel, seed: 3 });
    const e = playerOf(sim);
    e.get(Transform);
    const body = sim.ctx.bodies.get(e);
    body?.setPosition({ x: 5, y: 3.2 });
    let jumps = 0;
    let prevJump = false;
    for (let i = 0; i < 240; i++) {
      const input = hold({ moveX: -1, jump: i % 12 < 3, aimX: -1, aimY: 0 });
      if (input.jump && !prevJump) jumps += 1;
      prevJump = input.jump;
      sim.step([input, hold({}), hold({}), hold({})]);
      if ((e.get(Transform)?.y ?? 0) >= 9) break;
    }
    expect(e.get(Transform)?.y ?? 0).toBeGreaterThanOrEqual(8.5);
    expect(jumps).toBeLessThanOrEqual(24);
  });

  it('runs ~30 m in about 4 seconds', () => {
    const sim = makeSim({ seed: 4 });
    stepMany(sim, 20);
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
