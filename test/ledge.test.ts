import { describe, expect, it } from 'vitest';
import { floe } from '../src/levels/launch';
import { HANG_DROP } from '../src/sim/player/ledge';
import { Combat, Controller, Dead, Hazard, HazardKind, Status, Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf, skyhold, stepMany } from './helpers';

/**
 * Skyhold's island spans x 8..24 with its top at y 4. The fighter starts just off its left face with
 * the lip a metre above the body centre, as if cresting a recovery jump (falling onto the lip from
 * above is the mantle assist's job).
 */
const LIP_Y = 4;
const WALL_X = 8;

function dropBesideLedge(settings: Record<string, unknown> = {}) {
  const sim = makeSim({ level: skyhold, seed: 2, settings: { playerCount: 1, bots: 0, items: 'off', ...settings } });
  const p = playerOf(sim);
  sim.ctx.bodies.get(p)?.setPosition({ x: 7.6, y: LIP_Y - 1 });
  sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
  p.set(Transform, { x: 7.6, y: LIP_Y - 1, angle: 0 });
  return { sim, p };
}

/** Hold the stick toward the island until the fighter is hanging (or `max` ticks pass). */
function fallToGrab(sim: ReturnType<typeof makeSim>, p: ReturnType<typeof playerOf>, max = 90) {
  let grabbedAt = -1;
  let ledgeEvents = 0;
  for (let i = 0; i < max; i++) {
    const ev = sim.step([hold({ moveX: 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    ledgeEvents += ev.filter((e) => e.type === 'ledge').length;
    if ((p.get(Controller)?.hangDir ?? 0) !== 0) {
      grabbedAt = i;
      break;
    }
  }
  return { grabbedAt, ledgeEvents };
}

describe('ledge grab', () => {
  it('a fighter falling past a lip while pushing toward it catches it and hangs there', () => {
    const { sim, p } = dropBesideLedge();
    const { grabbedAt, ledgeEvents } = fallToGrab(sim, p);
    expect(grabbedAt).toBeGreaterThanOrEqual(0);
    expect(ledgeEvents).toBe(1);
    const ctrl = p.get(Controller)!;
    expect(ctrl.hangDir).toBe(1);
    expect(ctrl.facing).toBe(1);
    // Hold the lip for a second with the stick centred: no drift, no fall, no death.
    stepMany(sim, 60, [hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    const t = p.get(Transform)!;
    expect(p.get(Controller)?.hangDir).toBe(1);
    expect(t.y).toBeCloseTo(LIP_Y - HANG_DROP, 1);
    expect(t.x).toBeLessThan(WALL_X);
    expect(t.x).toBeGreaterThan(WALL_X - 0.5);
    expect(p.has(Dead)).toBe(false);
    // Standing mode: no immunity on the lip; a hanging fighter can be hit.
    expect(p.get(Status)?.invuln ?? 0).toBe(0);
  });

  it('launch mode grants a moment of immunity on the grab', () => {
    const { sim, p } = dropBesideLedge({ mode: 'launch' });
    fallToGrab(sim, p);
    expect(p.get(Status)?.invuln ?? 0).toBeGreaterThan(0);
    expect(p.get(Status)?.invuln ?? 0).toBeLessThanOrEqual(sim.ctx.tuning.ledgeInvulnTicks);
  });

  it('jump hops off the ledge and lands on the stage', () => {
    const { sim, p } = dropBesideLedge();
    fallToGrab(sim, p);
    stepMany(sim, 10, [hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    sim.step([hold({ jump: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(p.get(Controller)?.hangDir).toBe(0);
    expect(p.get(Controller)?.vy).toBeGreaterThan(sim.ctx.tuning.jumpSpeed * 0.9);
    let landed = false;
    for (let i = 0; i < 90 && !landed; i++) {
      sim.step([hold({ moveX: 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      landed = !!p.get(Controller)?.grounded;
    }
    expect(landed).toBe(true);
    expect(p.get(Transform)!.x).toBeGreaterThan(WALL_X);
    expect(p.get(Transform)!.y).toBeGreaterThan(LIP_Y);
  });

  it('holding toward the ledge climbs onto it', () => {
    const { sim, p } = dropBesideLedge();
    fallToGrab(sim, p);
    let landed = false;
    let released = -1;
    for (let i = 0; i < 90 && !landed; i++) {
      sim.step([hold({ moveX: 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      if (released < 0 && (p.get(Controller)?.hangDir ?? 0) === 0) released = i;
      landed = !!p.get(Controller)?.grounded;
    }
    // Lets go after the grace ticks, then lands on top.
    expect(released).toBeGreaterThanOrEqual(sim.ctx.tuning.hangGraceTicks - 1);
    expect(landed).toBe(true);
    expect(p.get(Transform)!.x).toBeGreaterThan(WALL_X);
    expect(p.get(Transform)!.y).toBeGreaterThan(LIP_Y);
  });

  it('down lets go, and the lockout stops an instant regrab even while pushing back in', () => {
    const { sim, p } = dropBesideLedge();
    fallToGrab(sim, p);
    stepMany(sim, 10, [hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    sim.step([hold({ down: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(p.get(Controller)?.hangDir).toBe(0);
    expect(p.get(Controller)?.regrabLock).toBe(sim.ctx.tuning.regrabLockTicks);
    for (let i = 0; i < 12; i++) {
      sim.step([hold({ moveX: 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
      expect(p.get(Controller)?.hangDir).toBe(0);
    }
    expect(p.get(Transform)!.y).toBeLessThan(LIP_Y - HANG_DROP - 0.3);
  });

  it('a hang cannot be held forever', () => {
    const { sim, p } = dropBesideLedge();
    fallToGrab(sim, p);
    const cap = sim.ctx.tuning.maxHangTicks;
    stepMany(sim, cap - 5, [hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(p.get(Controller)?.hangDir).toBe(1);
    stepMany(sim, 10, [hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(p.get(Controller)?.hangDir).toBe(0);
    expect(p.get(Controller)?.regrabLock).toBeGreaterThan(0);
  });

  it('attacking from the ledge is a get-up attack: climb plus the strike', () => {
    const { sim, p } = dropBesideLedge();
    fallToGrab(sim, p);
    stepMany(sim, 10, [hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    const ev = sim.step([hold({ attack: true, aimX: 1, aimY: 0.3 }), hold({}), hold({}), hold({})]);
    expect(p.get(Controller)?.hangDir).toBe(0);
    expect(p.get(Controller)?.vy).toBeGreaterThan(3);
    expect(ev.some((e) => e.type === 'punch')).toBe(true);
    expect(p.get(Combat)?.strikePending ?? 0).toBeGreaterThan(0);
  });

  it('a hit knocks the fighter off the ledge', () => {
    const { sim, p } = dropBesideLedge();
    fallToGrab(sim, p);
    p.set(Combat, { stun: 12 });
    sim.step([hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(p.get(Controller)?.hangDir).toBe(0);
    expect(sim.ctx.bodies.get(p)?.getGravityScale()).toBe(1);
  });

  it('does not grab a lip when there is floor to land on and no push toward it', () => {
    // The gym spawn beside a hip-high ledge: the fighter should simply land on the floor.
    const sim = makeSim({ seed: 2, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 20, y: 5 });
    p.set(Transform, { x: 20, y: 5, angle: 0 });
    for (let i = 0; i < 60; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      expect(p.get(Controller)?.hangDir).toBe(0);
    }
    expect(p.get(Controller)?.grounded).toBe(true);
  });

  it('a moving platform carries its hanger', () => {
    const sim = makeSim({ level: floe, seed: 2, settings: { playerCount: 1, bots: 0, items: 'off' } });
    const p = playerOf(sim);
    // Floe's bobbing platform spans x 16.5..19.5 and rides between y 6 and 9 (its top 0.2 higher).
    const platform = sim.ecs.query(Hazard, Transform).find((e) => e.get(Hazard)?.kind === HazardKind.MovingPlatform)!;
    const top0 = platform.get(Transform)!.y + 0.2;
    sim.ctx.bodies.get(p)?.setPosition({ x: 16.05, y: top0 - 1 });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    p.set(Transform, { x: 16.05, y: top0 - 1, angle: 0 });
    const { grabbedAt } = fallToGrab(sim, p, 120);
    expect(grabbedAt).toBeGreaterThanOrEqual(0);
    const startY = p.get(Transform)!.y;
    stepMany(sim, 60, [hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(p.get(Controller)?.hangDir).toBe(1);
    const top = platform.get(Transform)!.y + 0.2;
    expect(Math.abs(p.get(Transform)!.y - startY)).toBeGreaterThan(0.5);
    expect(p.get(Transform)!.y).toBeCloseTo(top - HANG_DROP, 0);
  });
});
