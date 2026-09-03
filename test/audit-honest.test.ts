import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { woodsClearing } from '../src/levels/handauthored';
import { authored } from '../src/sim/authored';
import { diskSweepsPlayer } from '../src/sim/hazards/common';
import { crusherOverlaps } from '../src/sim/hazards/crusher';
import { lavaSweepsPlayer } from '../src/sim/hazards/lava';
import { sawOverlaps } from '../src/sim/hazards/saw';
import { applyExplosion } from '../src/sim/physics/queries';
import { inMeleeArc } from '../src/sim/weapons/projectiles';
import { weaponIndex } from '../src/sim/weapons/defs';
import { nextMatchLevel } from '../src/sim/systems/reset';
import {
  Aim,
  Dead,
  Hazard,
  HazardKind,
  Health,
  MatchState,
  OwnedBy,
  PhysBody,
  Player,
  PrevTransform,
  Projectile,
  ProjectileKind,
  RoundPhase,
  RoundState,
  Transform,
  Weapon,
} from '../src/sim/traits';
import {
  freezeHazardKinematics,
  hold,
  makeSim,
  pin,
  place,
  playerOf,
  pointOnSweepOutsideCurrent,
  speedRounds,
} from './helpers';

function countKind(sim: ReturnType<typeof makeSim>, kind: number): number {
  let n = 0;
  sim.ecs.query(Hazard).updateEach(([hz]) => {
    if (hz.kind === kind) n += 1;
  });
  return n;
}

function leftoverProps(sim: ReturnType<typeof makeSim>): number {
  let n = 0;
  sim.ecs.query(PhysBody).updateEach((_, e) => {
    if (e.has(Player) || e.has(Hazard)) return;
    n += 1;
  });
  return n;
}

describe('honest PLAN stand-ins (no pin/pred OR, no scoreboard shrink)', () => {
  it('speedRounds keeps Appendix A scoreboardTicks = 90', () => {
    const sim = makeSim({ settings: { playerCount: 2 } });
    expect(sim.ctx.tuning.scoreboardTicks).toBe(90);
    speedRounds(sim);
    expect(sim.ctx.tuning.countdownTicks).toBe(3);
    expect(sim.ctx.tuning.slowmoTicks).toBe(2);
    expect(sim.ctx.tuning.scoreboardTicks).toBe(90);
  });

  it('Scoreboard phase lasts 90 ticks at default tuning', () => {
    const sim = makeSim({
      level: woodsClearing,
      seed: 7,
      settings: { playerCount: 2, bots: 0 },
    });
    sim.ctx.tuning.countdownTicks = 2;
    expect(sim.ctx.tuning.scoreboardTicks).toBe(90);
    for (let i = 0; i < 8; i++) sim.step();
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);
    playerOf(sim, 1).set(Health, { hp: 0, maxHp: 100 });
    let samples = 0;
    for (let i = 0; i < 400; i++) {
      sim.step();
      if (sim.ecs.get(RoundState)?.phase === RoundPhase.Scoreboard) samples += 1;
      if ((sim.ecs.get(MatchState)?.round ?? 0) >= 1) break;
    }
    expect(samples).toBeGreaterThanOrEqual(88);
    expect(samples).toBeLessThanOrEqual(91);
    expect(sim.ecs.get(MatchState)?.round ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('a path saw kills a standing player at authored speed (no 720 pin)', () => {
    const level = {
      ...getLevel('test-saw-path'),
      id: 'saw-ledge',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'solid' as const, x: 14, y: 4, w: 4, h: 0.5 },
        {
          type: 'saw' as const,
          x: 8,
          y: 5.2,
          r: 0.45,
          speed: 6,
          mode: 'pingpong' as const,
          path: [
            { x: 8, y: 5.2 },
            { x: 20, y: 5.2 },
          ],
        },
      ],
    };
    const sim = makeSim({ level, seed: 40, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 14, 5.3);
    let deadAt = -1;
    for (let i = 0; i < 180; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0) {
        deadAt = i;
        break;
      }
    }
    expect(deadAt).toBeGreaterThan(4);
    expect(p.has(Dead)).toBe(true);
  });

  it('vertical saw last-tick PrevTransform kills after live motion with velocity zeroed', () => {
    const level = {
      ...getLevel('test-saw-path'),
      id: 'sweep-saw-prev-y',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        {
          type: 'saw' as const,
          x: 14,
          y: 4,
          r: 0.45,
          speed: 720,
          mode: 'pingpong' as const,
          path: [
            { x: 14, y: 4 },
            { x: 14, y: 16 },
          ],
        },
      ],
    };
    const sim = makeSim({ level, seed: 241, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    const span = { prev: 4, now: 4, x: 14, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Saw) return;
      span.prev = prev.y;
      span.now = t.y;
      span.x = t.x;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    expect(Math.min(span.prev, span.now)).toBeLessThan(10);
    expect(Math.max(span.prev, span.now)).toBeGreaterThan(10);
    freezeHazardKinematics(sim, HazardKind.Saw);
    // diskSweepsPlayer Y half-extent is reach + player half-height (0.7 + 0.9).
    const hitY = pointOnSweepOutsideCurrent(span.prev, span.now, 1.6);
    expect(hitY).not.toBeNull();
    expect(sawOverlaps(span.x, hitY!, span.x, span.now, 0.7, span.x, span.now)).toBe(false);
    expect(sawOverlaps(span.x, hitY!, span.x, span.now, 0.7, span.x, span.prev)).toBe(true);
    place(sim, p, span.x, hitY!);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = { now: span.now };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Saw) after.now = t.y;
    });
    expect(Math.abs(after.now - span.now)).toBeLessThan(0.08);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('saw last-tick PrevTransform kills after live motion with velocity zeroed', () => {
    const level = {
      ...getLevel('test-saw-path'),
      id: 'sweep-saw-prev',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        {
          type: 'saw' as const,
          x: 8,
          y: 5,
          r: 0.45,
          speed: 720,
          mode: 'pingpong' as const,
          path: [
            { x: 8, y: 5 },
            { x: 20, y: 5 },
          ],
        },
      ],
    };
    const sim = makeSim({ level, seed: 41, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    const span = { prev: 8, now: 8, y: 5, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Saw) return;
      span.prev = prev.x;
      span.now = t.x;
      span.y = t.y;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    expect(Math.min(span.prev, span.now)).toBeLessThan(14);
    expect(Math.max(span.prev, span.now)).toBeGreaterThan(14);
    // Kill tick must not re-drive the path (that is a this-tick teleport / vel*dt substitute).
    freezeHazardKinematics(sim, HazardKind.Saw);
    const hitX = pointOnSweepOutsideCurrent(span.prev, span.now, 1);
    expect(hitX).not.toBeNull();
    expect(sawOverlaps(hitX!, span.y, span.now, span.y, 0.7, span.now, span.y)).toBe(false);
    expect(sawOverlaps(hitX!, span.y, span.now, span.y, 0.7, span.prev, span.y)).toBe(true);
    place(sim, p, hitX!, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = { now: span.now };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Saw) after.now = t.x;
    });
    expect(Math.abs(after.now - span.now)).toBeLessThan(0.08);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('saw does not kill at the old midpoint once the last-tick span is collapsed', () => {
    const level = {
      ...getLevel('test-saw-path'),
      id: 'sweep-saw-collapsed',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        {
          type: 'saw' as const,
          x: 8,
          y: 5,
          r: 0.45,
          speed: 720,
          mode: 'pingpong' as const,
          path: [
            { x: 8, y: 5 },
            { x: 20, y: 5 },
          ],
        },
      ],
    };
    const sim = makeSim({ level, seed: 141, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    const span = { prev: 8, now: 8, y: 5, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Saw) return;
      span.prev = prev.x;
      span.now = t.x;
      span.y = t.y;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    freezeHazardKinematics(sim, HazardKind.Saw);
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Saw) return;
      prev.x = t.x;
      prev.y = t.y;
    });
    const hitX = pointOnSweepOutsideCurrent(span.prev, span.now, 1);
    expect(hitX).not.toBeNull();
    place(sim, p, hitX!, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('laser last-tick PrevTransform kills after a live skip with velocity zeroed', () => {
    const level = {
      ...getLevel('test-laser'),
      id: 'sweep-laser-prev',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'laser' as const, x: 2, y: 7, onTicks: 80, offTicks: 1, warningTicks: 0 },
      ],
    };
    const sim = makeSim({ level, seed: 42, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    // Planck clamps a tick to ~2 m, so start just under the beam and skip across it.
    place(sim, p, 8, 5.2);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 200 });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    const prev = p.get(PrevTransform);
    const now = p.get(Transform);
    expect(prev?.y ?? 7).toBeLessThan(7);
    expect(now?.y ?? 3).toBeGreaterThan(7);
    // Current capsule must miss the beam (halfH 0.9). Only last-tick Prev→now may kill.
    place(sim, p, 8, 12);
    expect(p.get(PrevTransform)?.y ?? 7).toBeLessThan(7);
    expect(p.get(Transform)?.y ?? 0).toBeGreaterThan(10);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('laser does not kill after the last-tick skip is collapsed onto the far pose', () => {
    const level = {
      ...getLevel('test-laser'),
      id: 'sweep-laser-collapsed',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'laser' as const, x: 2, y: 7, onTicks: 80, offTicks: 1, warningTicks: 0 },
      ],
    };
    const sim = makeSim({ level, seed: 151, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 8, 5.2);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 200 });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    place(sim, p, 8, 12);
    p.set(PrevTransform, { x: 8, y: 12, angle: 0 });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('a player walking through a vertical laser dies at run speed', () => {
    const level = {
      ...getLevel('test-laser'),
      id: 'laser-walk',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        {
          type: 'laser' as const,
          x: 10,
          y: 2,
          dir: 'up' as const,
          onTicks: 80,
          offTicks: 1,
          warningTicks: 0,
        },
      ],
    };
    const sim = makeSim({ level, seed: 43, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 6, 4);
    for (let i = 0; i < 12; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    for (let i = 0; i < 90; i++) {
      sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
      if (p.has(Dead)) break;
    }
    expect(p.has(Dead)).toBe(true);
  });

  it('crusher last-tick PrevTransform kills after live motion with velocity zeroed', () => {
    const level = {
      ...getLevel('test-crusher'),
      id: 'sweep-crusher-prev',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'crusher' as const, x: 8, y: 5, w: 1.5, h: 2, period: 1, speed: 720 },
      ],
    };
    const sim = makeSim({ level, seed: 47, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const span = { prev: 8, now: 8, y: 5, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Crusher) return;
      span.prev = prev.x;
      span.now = t.x;
      span.y = t.y;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    expect(Math.abs(span.now - span.prev)).toBeGreaterThan(1.5);
    const hitX = pointOnSweepOutsideCurrent(span.prev, span.now, 1.05);
    expect(hitX).not.toBeNull();
    expect(crusherOverlaps(hitX!, span.y, span.now, span.y, 0.75, 1, span.now, span.y)).toBe(false);
    expect(crusherOverlaps(hitX!, span.y, span.now, span.y, 0.75, 1, span.prev, span.y)).toBe(true);
    sim.ctx.holdHazards = false;
    freezeHazardKinematics(sim, HazardKind.Crusher);
    place(sim, p, hitX!, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = { now: span.now };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crusher) after.now = t.x;
    });
    expect(Math.abs(after.now - span.now)).toBeLessThan(0.02);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('crusher does not kill at the old sweep point once the last-tick span is collapsed', () => {
    const level = {
      ...getLevel('test-crusher'),
      id: 'sweep-crusher-collapsed',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'crusher' as const, x: 8, y: 5, w: 1.5, h: 2, period: 1, speed: 720 },
      ],
    };
    const sim = makeSim({ level, seed: 147, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const span = { prev: 8, now: 8, y: 5, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Crusher) return;
      span.prev = prev.x;
      span.now = t.x;
      span.y = t.y;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    const hitX = pointOnSweepOutsideCurrent(span.prev, span.now, 1.05);
    expect(hitX).not.toBeNull();
    sim.ctx.holdHazards = false;
    freezeHazardKinematics(sim, HazardKind.Crusher);
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Crusher) return;
      prev.x = t.x;
      prev.y = t.y;
    });
    place(sim, p, hitX!, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('a crusher with param1 = 0 does not drive this tick', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-crusher'),
        id: 'crusher-frozen',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'crusher' as const, x: 10, y: 5, w: 1.5, h: 2, period: 1, speed: 720 },
        ],
      },
      seed: 148,
      settings: { playerCount: 1 },
    });
    freezeHazardKinematics(sim, HazardKind.Crusher);
    const x0 = { n: 10 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crusher) x0.n = t.x;
    });
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let x1 = x0.n;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crusher) x1 = t.x;
    });
    expect(Math.abs(x1 - x0.n)).toBeLessThan(0.02);
  });

  it('a saw with param0 = 0 does not spin this tick', () => {
    const sim = makeSim({
      level: getLevel('test-saw'),
      seed: 149,
      settings: { playerCount: 1 },
    });
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Saw) return;
      hz.param0 = 0;
      hz.param1 = 0;
      sim.ctx.bodies.get(e)?.setAngularVelocity(0);
    });
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let omega = 99;
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind === HazardKind.Saw) omega = sim.ctx.bodies.get(e)?.getAngularVelocity() ?? 99;
    });
    expect(Math.abs(omega)).toBeLessThan(0.02);
  });

  it('a conveyor with param1 = 0 does not carry a standing player', () => {
    const sim = makeSim({
      level: getLevel('test-conveyor'),
      seed: 150,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const belt = getLevel('test-conveyor').objects.find((o) => o.type === 'conveyor');
    sim.ctx.bodies.get(p)?.setPosition({ x: belt?.x ?? 16, y: (belt?.y ?? 2.2) + 1.1 });
    for (let i = 0; i < 6; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Conveyor) hz.param1 = 0;
    });
    const x0 = p.get(Transform)?.x ?? 0;
    for (let i = 0; i < 16; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    // Residual settle only. A `|| 4` belt drive would carry well past 1 m in 16 ticks.
    expect(Math.abs((p.get(Transform)?.x ?? 0) - x0)).toBeLessThan(0.25);
  });

  it('a rotating platform with param0 = 0 does not spin this tick', () => {
    const sim = makeSim({
      level: getLevel('test-platform.rotating'),
      seed: 151,
      settings: { playerCount: 1 },
    });
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.RotatingPlatform) return;
      hz.param0 = 0;
      sim.ctx.bodies.get(e)?.setAngularVelocity(0);
    });
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let omega = 99;
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind === HazardKind.RotatingPlatform) {
        omega = sim.ctx.bodies.get(e)?.getAngularVelocity() ?? 99;
      }
    });
    expect(Math.abs(omega)).toBeLessThan(0.02);
  });

  it('a bounce pad with param1 = 0 does not launch', () => {
    const sim = makeSim({
      level: getLevel('test-bounce'),
      seed: 152,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const pad = getLevel('test-bounce').objects.find((o) => o.type === 'bounce');
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Bounce) hz.param1 = 0;
    });
    sim.ctx.bodies.get(p)?.setPosition({ x: pad?.x ?? 13, y: (pad?.y ?? 2.3) + 0.9 });
    let launched = false;
    for (let i = 0; i < 20; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if ((sim.ctx.bodies.get(p)?.getLinearVelocity().y ?? 0) > 4) launched = true;
    }
    expect(launched).toBe(false);
  });

  it('spikeball last-tick PrevTransform kills after live motion with velocity zeroed', () => {
    const sim = makeSim({
      level: getLevel('test-spikeball-roll'),
      seed: 48,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 720, y: 0 });
    });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const span = { prev: 10, now: 10, y: 3.2, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      span.prev = prev.x;
      span.now = t.x;
      span.y = t.y;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    expect(Math.abs(span.now - span.prev)).toBeGreaterThan(1.5);
    const hitX = pointOnSweepOutsideCurrent(span.prev, span.now, 1.05);
    expect(hitX).not.toBeNull();
    expect(diskSweepsPlayer(hitX!, span.y, span.now, span.y, 0.75, span.now, span.y)).toBe(false);
    expect(diskSweepsPlayer(hitX!, span.y, span.now, span.y, 0.75, span.prev, span.y)).toBe(true);
    sim.ctx.holdHazards = false;
    freezeHazardKinematics(sim, HazardKind.Spikeball);
    place(sim, p, hitX!, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = { now: span.now };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) after.now = t.x;
    });
    expect(Math.abs(after.now - span.now)).toBeLessThan(0.08);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('vertical spikeball last-tick PrevTransform kills after live motion with velocity zeroed', () => {
    const sim = makeSim({
      level: getLevel('test-spikeball-drop'),
      seed: 248,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 720 });
    });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const span = { prev: 4, now: 4, x: 14, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      span.prev = prev.y;
      span.now = t.y;
      span.x = t.x;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    expect(Math.abs(span.now - span.prev)).toBeGreaterThan(1.9);
    // diskSweepsPlayer Y half-extent is reach + player half-height (0.75 + 0.9).
    const hitY = pointOnSweepOutsideCurrent(span.prev, span.now, 1.65);
    expect(hitY).not.toBeNull();
    expect(diskSweepsPlayer(span.x, hitY!, span.x, span.now, 0.75, span.x, span.now)).toBe(false);
    expect(diskSweepsPlayer(span.x, hitY!, span.x, span.now, 0.75, span.x, span.prev)).toBe(true);
    sim.ctx.holdHazards = false;
    freezeHazardKinematics(sim, HazardKind.Spikeball);
    place(sim, p, span.x, hitY!);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = { now: span.now };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) after.now = t.y;
    });
    expect(Math.abs(after.now - span.now)).toBeLessThan(0.08);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('spikeball does not kill at the old sweep point once the last-tick span is collapsed', () => {
    const sim = makeSim({
      level: getLevel('test-spikeball-roll'),
      seed: 149,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    place(sim, p, 4, 10);
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 720, y: 0 });
    });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const span = { prev: 10, now: 10, y: 3.2, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      span.prev = prev.x;
      span.now = t.x;
      span.y = t.y;
      span.ok = true;
    });
    expect(span.ok).toBe(true);
    const hitX = pointOnSweepOutsideCurrent(span.prev, span.now, 1.05);
    expect(hitX).not.toBeNull();
    sim.ctx.holdHazards = false;
    freezeHazardKinematics(sim, HazardKind.Spikeball);
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev]) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      prev.x = t.x;
      prev.y = t.y;
    });
    place(sim, p, hitX!, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('desert crate stacks spawn and topple when the base is pushed', () => {
    const level = {
      ...getLevel('desert-01'),
      id: 'crate-tower',
      objects: [
        { type: 'solid' as const, x: 16, y: 1, w: 32, h: 2 },
        { type: 'crate' as const, x: 12, y: 2.55, w: 1.1, h: 1.1 },
        { type: 'crate' as const, x: 12, y: 3.65, w: 1.1, h: 1.1 },
        { type: 'crate' as const, x: 12, y: 4.75, w: 1.1, h: 1.1 },
      ],
    };
    const sim = makeSim({ level, seed: 44, settings: { playerCount: 1 } });
    expect(countKind(sim, HazardKind.Crate)).toBe(3);
    for (let i = 0; i < 20; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const crates: { e: ReturnType<typeof playerOf>; x: number; y: number; angle: number }[] = [];
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t], e) => {
      if (hz.kind !== HazardKind.Crate) return;
      crates.push({ e, x: t.x, y: t.y, angle: t.angle });
    });
    expect(crates).toHaveLength(3);
    const top = crates.reduce((a, b) => (b.y > a.y ? b : a));
    expect(top.y).toBeGreaterThan(4);
    const bases = crates.filter((c) => c.y < 3.2);
    expect(bases.length).toBeGreaterThan(0);
    for (const c of bases) {
      const body = sim.ctx.bodies.get(c.e);
      body?.applyLinearImpulse({ x: 6.5, y: 0.35 }, body.getWorldCenter());
    }
    for (let i = 0; i < 90; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = top.e.get(Transform);
    expect(after).toBeTruthy();
    // Topple: the same top crate leaves the stack column and falls or tips.
    expect(Math.abs((after?.x ?? top.x) - top.x)).toBeGreaterThan(0.45);
    expect((after?.y ?? top.y) < top.y - 0.2 || Math.abs((after?.angle ?? 0) - top.angle) > 0.35).toBe(
      true,
    );
  });

  it('a walking player topples a settled three-crate stack', () => {
    const level = {
      ...getLevel('desert-01'),
      id: 'crate-walk-topple',
      objects: [
        { type: 'solid' as const, x: 16, y: 1, w: 32, h: 2 },
        { type: 'crate' as const, x: 12, y: 2.55, w: 1.1, h: 1.1 },
        { type: 'crate' as const, x: 12, y: 3.65, w: 1.1, h: 1.1 },
        { type: 'crate' as const, x: 12, y: 4.75, w: 1.1, h: 1.1 },
      ],
    };
    const sim = makeSim({ level, seed: 144, settings: { playerCount: 1 } });
    for (let i = 0; i < 24; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const top = { e: playerOf(sim), x: 12, y: -99 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t], e) => {
      if (hz.kind !== HazardKind.Crate) return;
      if (t.y > top.y) {
        top.e = e;
        top.x = t.x;
        top.y = t.y;
      }
    });
    expect(top.y).toBeGreaterThan(4);
    const p = playerOf(sim);
    place(sim, p, 10.4, 3.2);
    for (let i = 0; i < 200; i++) sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    const after = top.e.get(Transform);
    expect(Math.abs((after?.x ?? top.x) - top.x)).toBeGreaterThan(0.35);
    expect((after?.y ?? top.y) < top.y - 0.15 || Math.abs(after?.angle ?? 0) > 0.3).toBe(true);
  });

  it('place leaves PrevTransform so last-tick sweeps stay honest (pin does not)', () => {
    const sim = makeSim({ settings: { playerCount: 1 } });
    const p = playerOf(sim);
    pin(sim, p, 6, 4);
    expect(p.get(PrevTransform)?.x).toBeCloseTo(6, 5);
    expect(p.get(PrevTransform)?.y).toBeCloseTo(4, 5);
    place(sim, p, 11, 7);
    expect(p.get(Transform)?.x).toBeCloseTo(11, 5);
    expect(p.get(Transform)?.y).toBeCloseTo(7, 5);
    expect(p.get(PrevTransform)?.x).toBeCloseTo(6, 5);
    expect(p.get(PrevTransform)?.y).toBeCloseTo(4, 5);
    const body = sim.ctx.bodies.get(p)?.getPosition();
    expect(body?.x).toBeCloseTo(11, 5);
    expect(body?.y).toBeCloseTo(7, 5);
  });

  it('crates are dynamic Appendix D boxes (density 0.5, friction 0.5)', () => {
    const sim = makeSim({ level: getLevel('test-crate'), seed: 150, settings: { playerCount: 1 } });
    const seen = { n: 0, density: 0, friction: 0, type: '' };
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Crate) return;
      const body = sim.ctx.bodies.get(e);
      const fixture = body?.getFixtureList();
      seen.n += 1;
      seen.type = body?.getType() ?? '';
      seen.density = fixture?.getDensity() ?? 0;
      seen.friction = fixture?.getFriction() ?? 0;
    });
    expect(seen.n).toBeGreaterThan(0);
    expect(seen.type).toBe('dynamic');
    expect(seen.density).toBeCloseTo(0.5, 5);
    expect(seen.friction).toBeCloseTo(0.5, 5);
  });

  it('M0 test boxes tagged as crates use Appendix D density/friction', () => {
    const sim = makeSim({ seed: 152, settings: { playerCount: 0 }, boxes: 3, spawnPlayers: false });
    const seen = { n: 0, density: 0, friction: 0 };
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Crate) return;
      const fixture = sim.ctx.bodies.get(e)?.getFixtureList();
      seen.n += 1;
      seen.density = fixture?.getDensity() ?? 0;
      seen.friction = fixture?.getFriction() ?? 0;
    });
    expect(seen.n).toBe(3);
    expect(seen.density).toBeCloseTo(0.5, 5);
    expect(seen.friction).toBeCloseTo(0.5, 5);
  });

  it('level reload respawns authored crates and drops M0 test boxes', () => {
    const sim = makeSim({
      level: getLevel('desert-01'),
      seed: 45,
      settings: {
        playerCount: 1,
        enabledLevels: ['woods-01'],
        rotation: 'ordered',
      },
      boxes: 4,
    });
    expect(countKind(sim, HazardKind.Crate)).toBeGreaterThanOrEqual(8);
    const pushed = { x: 0 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t], e) => {
      if (hz.kind !== HazardKind.Crate || t.y > 3.5) return;
      pushed.x = t.x;
      sim.ctx.bodies.get(e)?.setPosition({ x: t.x + 3, y: t.y });
      e.set(Transform, { x: t.x + 3, y: t.y, angle: 0 });
    });
    expect(pushed.x).toBeGreaterThan(0);
    nextMatchLevel(sim.ecs);
    expect(sim.ctx.level.id).toBe('woods-01');
    expect(countKind(sim, HazardKind.Crate)).toBe(0);
    expect(leftoverProps(sim)).toBe(0);
  });

  it('a laser with onTicks = 0 never fires', () => {
    const level = {
      ...getLevel('test-laser'),
      id: 'laser-zero-on',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'laser' as const, x: 2, y: 7, onTicks: 0, offTicks: 40, warningTicks: 0 },
      ],
    };
    const sim = makeSim({ level, seed: 160, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 8, 7);
    for (let i = 0; i < 50; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('a disappearing platform with period = 0 stays solid', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-platform.disappearing'),
        id: 'disappear-frozen',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'platform.disappearing' as const, x: 12, y: 6, w: 4, h: 0.5, period: 0 },
        ],
      },
      seed: 161,
      settings: { playerCount: 1 },
    });
    for (let i = 0; i < 200; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let active = false;
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Disappearing) return;
      expect(hz.armed).toBe(1);
      active = sim.ctx.bodies.get(e)?.isActive() ?? false;
    });
    expect(active).toBe(true);
  });

  it('a collapsing platform with delay = 0 falls on the first stand tick', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-platform.collapsing'),
        id: 'collapse-now',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'platform.collapsing' as const, x: 12, y: 5, w: 4, h: 0.5, delay: 0 },
        ],
      },
      seed: 162,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const plat = { x: 12, y: 5 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Collapsing) {
        plat.x = t.x;
        plat.y = t.y;
      }
    });
    place(sim, p, plat.x, plat.y + 1.15);
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let armed = 1;
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Collapsing) armed = hz.armed;
    });
    expect(armed).toBe(0);
  });

  it('a crusher with period = 0 does not oscillate even when speed is set', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-crusher'),
        id: 'crusher-period-zero',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'crusher' as const, x: 10, y: 5, w: 1.5, h: 2, period: 0, speed: 720 },
        ],
      },
      seed: 163,
      settings: { playerCount: 1 },
    });
    const x0 = { n: 10 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crusher) x0.n = t.x;
    });
    for (let i = 0; i < 12; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let x1 = x0.n;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crusher) x1 = t.x;
    });
    expect(Math.abs(x1 - x0.n)).toBeLessThan(0.02);
  });

  it('spikes last-tick PrevTransform kills after a live skip with velocity zeroed', () => {
    const level = {
      ...getLevel('test-spikes'),
      id: 'sweep-spikes-prev',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'spikes' as const, x: 12, y: 6, w: 4, dir: 'up' as const },
      ],
    };
    const sim = makeSim({ level, seed: 164, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    // Planck clamps a tick to ~2 m; start just under the bed so the skip crosses it.
    place(sim, p, 12, 4.8);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 200 });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    const prev = p.get(PrevTransform);
    const now = p.get(Transform);
    expect(prev?.y ?? 6).toBeLessThan(6);
    expect(now?.y ?? 3).toBeGreaterThan(6);
    place(sim, p, 12, 10);
    expect(p.get(PrevTransform)?.y ?? 6).toBeLessThan(6);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('spikes do not kill after the last-tick skip is collapsed onto the far pose', () => {
    const level = {
      ...getLevel('test-spikes'),
      id: 'sweep-spikes-collapsed',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'spikes' as const, x: 12, y: 6, w: 4, dir: 'up' as const },
      ],
    };
    const sim = makeSim({ level, seed: 165, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    place(sim, p, 12, 4.8);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 200 });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    place(sim, p, 12, 10);
    p.set(PrevTransform, { x: 12, y: 10, angle: 0 });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('lavaSweepsPlayer hits a last→now pass whose endpoints miss the bed', () => {
    // Endpoints sit just outside the y band (hy-1 .. hy+0.6). Current-pose gates miss this.
    expect(lavaSweepsPlayer(16, 10, 16, 0.45, 16, 1.6, 16, 1.6, 8)).toBe(true);
    expect(lavaSweepsPlayer(16, 10, 16, 10, 16, 1.6, 16, 1.6, 8)).toBe(false);
    expect(lavaSweepsPlayer(16, 10, 16, 0.45, 16, 1.6, 16, 1.6, 0)).toBe(false);
  });

  it('lava last-tick PrevTransform deals 35 after a live skip with velocity zeroed', () => {
    const level = {
      ...getLevel('test-lava'),
      id: 'sweep-lava-prev',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        // High bed so the skip is not jammed into the floor solid.
        { type: 'lava' as const, x: 16, y: 6, w: 8, h: 1.2, rate: 0 },
      ],
    };
    const sim = makeSim({ level, seed: 166, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    freezeHazardKinematics(sim, HazardKind.Lava);
    // Band is hy-1 .. hy+0.6 (5 .. 6.6). Start just under so endpoints miss.
    place(sim, p, 16, 4.85);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 200 });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    const prev = p.get(PrevTransform);
    expect(prev?.y ?? 6).toBeLessThan(5);
    place(sim, p, 16, 12);
    expect(p.get(PrevTransform)?.y ?? 6).toBeLessThan(5);
    expect(p.get(Transform)?.y ?? 0).toBeGreaterThan(10);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    const before = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(before - (p.get(Health)?.hp ?? 100)).toBe(35);
  });

  it('lava does not damage after the last-tick skip is collapsed onto the far pose', () => {
    const level = {
      ...getLevel('test-lava'),
      id: 'sweep-lava-collapsed',
      objects: [
        { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
        { type: 'lava' as const, x: 16, y: 6, w: 8, h: 1.2, rate: 0 },
      ],
    };
    const sim = makeSim({ level, seed: 167, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    freezeHazardKinematics(sim, HazardKind.Lava);
    place(sim, p, 16, 4.85);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 200 });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    place(sim, p, 16, 12);
    p.set(PrevTransform, { x: 16, y: 12, angle: 0 });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    const before = p.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.get(Health)?.hp ?? 0).toBe(before);
  });

  it('a conveyor with param0 = 0 does not carry even when standing on the body', () => {
    const sim = makeSim({
      level: getLevel('test-conveyor'),
      seed: 168,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const belt = getLevel('test-conveyor').objects.find((o) => o.type === 'conveyor');
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Conveyor) hz.param0 = 0;
    });
    sim.ctx.bodies.get(p)?.setPosition({ x: belt?.x ?? 16, y: (belt?.y ?? 2.2) + 1.1 });
    for (let i = 0; i < 6; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const x0 = p.get(Transform)?.x ?? 0;
    for (let i = 0; i < 16; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    // A `|| 3` width would still apply belt speed at the body center.
    expect(Math.abs((p.get(Transform)?.x ?? 0) - x0)).toBeLessThan(0.25);
  });

  it('a conveyor with omitted w still carries at the default width of 2', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-conveyor'),
        id: 'conveyor-omitted-w',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'conveyor' as const, x: 16, y: 2.2, h: 0.4, speed: 4 },
        ],
      },
      seed: 169,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 16, y: 3.3 });
    const xs: number[] = [];
    for (let i = 0; i < 40; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      xs.push(p.get(Transform)?.x ?? 0);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.2);
  });

  it('a bounce pad with param0 = 0 does not launch even when standing on the body', () => {
    const sim = makeSim({
      level: getLevel('test-bounce'),
      seed: 170,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const pad = getLevel('test-bounce').objects.find((o) => o.type === 'bounce');
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Bounce) hz.param0 = 0;
    });
    sim.ctx.bodies.get(p)?.setPosition({ x: pad?.x ?? 13, y: (pad?.y ?? 2.3) + 0.9 });
    let launched = false;
    for (let i = 0; i < 20; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if ((sim.ctx.bodies.get(p)?.getLinearVelocity().y ?? 0) > 4) launched = true;
    }
    expect(launched).toBe(false);
  });

  it('a bounce pad with omitted w still launches at the default width of 2', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-bounce'),
        id: 'bounce-omitted-w',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'bounce' as const, x: 13, y: 2.3, h: 0.4, speed: 16 },
        ],
      },
      seed: 171,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 13, y: 3.2 });
    let launched = false;
    for (let i = 0; i < 20; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if ((sim.ctx.bodies.get(p)?.getLinearVelocity().y ?? 0) > 4) launched = true;
    }
    expect(launched).toBe(true);
  });

  it('a collapsing platform with param0 = 0 does not start falling under a standing player', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-platform.collapsing'),
        id: 'collapse-zero-w',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'platform.collapsing' as const, x: 12, y: 5, w: 4, h: 0.5, delay: 0 },
        ],
      },
      seed: 172,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Collapsing) hz.param0 = 0;
    });
    place(sim, p, 12, 6.15);
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let armed = 0;
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Collapsing) armed = hz.armed;
    });
    expect(armed).toBe(1);
  });

  it('a spikeball with param0 = 0 does not kill at the substituted 0.4 radius', () => {
    const sim = makeSim({
      level: getLevel('test-spikeball-roll'),
      seed: 173,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const ball = { x: 10, y: 3.2 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind !== HazardKind.Spikeball) return;
      hz.param0 = 0;
      ball.x = t.x;
      ball.y = t.y;
    });
    freezeHazardKinematics(sim, HazardKind.Spikeball);
    // Honest reach is 0.35+0.3; `|| 0.4` reach is 0.75+0.3. 0.80 sits in the gap.
    pin(sim, p, ball.x + 0.8, ball.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('a crusher with zero half-extents does not kill at the substituted 0.75 box', () => {
    const sim = makeSim({
      level: getLevel('test-crusher'),
      seed: 174,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    const box = { x: 10, y: 5 };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind !== HazardKind.Crusher) return;
      hz.param2 = 0;
      hz.param3 = 0;
      box.x = t.x;
      box.y = t.y;
    });
    freezeHazardKinematics(sim, HazardKind.Crusher);
    pin(sim, p, box.x + 1.0, box.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('trigger.drop with weapon fists keeps index 0 (does not || 1 into pistol)', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-trigger.drop'),
        id: 'trigger-fists',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'trigger.drop' as const, x: 16, y: 12, atTick: 0, weapon: 'fists' },
        ],
      },
      seed: 175,
      settings: { playerCount: 1 },
    });
    let kind = '';
    for (let i = 0; i < 4; i++) {
      const ev = sim.step([hold({}), hold({}), hold({}), hold({})]);
      const spawn = ev.find((e) => e.type === 'spawn' && String(e.kind).startsWith('weapon:'));
      if (spawn && spawn.type === 'spawn') kind = spawn.kind;
    }
    expect(kind).toBe('weapon:fists');
    let defId = -1;
    sim.ecs.query(Weapon).updateEach(([w]) => {
      defId = w.defId;
    });
    expect(defId).toBe(weaponIndex('fists'));
    expect(defId).toBe(0);
  });

  it('authored keeps live 0 and only fills undefined', () => {
    expect(authored(0, 2)).toBe(0);
    expect(authored(0, 8)).toBe(0);
    expect(authored(0, 0.7)).toBe(0);
    expect(authored(undefined, 2)).toBe(2);
    expect(authored(undefined, 8)).toBe(8);
    expect(authored(undefined, 0.7)).toBe(0.7);
  });

  it('explosion radius 0 / impulse 0 do not substitute 2 / 8', () => {
    const sim = makeSim({ seed: 176, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    pin(sim, a, 10, 5);
    pin(sim, b, 11.2, 5);
    const hpA = a.get(Health)?.hp ?? 100;
    const hpB = b.get(Health)?.hp ?? 100;
    const vx0 = sim.ctx.bodies.get(b)?.getLinearVelocity().x ?? 0;
    applyExplosion(sim.ecs, 10, 5, authored(0, 2), authored(0, 8), () => {
      throw new Error('0-radius blast must not touch bodies');
    });
    expect(a.get(Health)?.hp ?? 0).toBe(hpA);
    expect(b.get(Health)?.hp ?? 0).toBe(hpB);
    expect(Math.abs((sim.ctx.bodies.get(b)?.getLinearVelocity().x ?? 0) - vx0)).toBeLessThan(0.05);
  });

  it('a melee projectile with catalog radius 0 does not use || 0.7', () => {
    expect(inMeleeArc(10, 5, 1, 0, 10.5, 5, authored(0, 0.7))).toBe(false);
    expect(inMeleeArc(10, 5, 1, 0, 10.5, 5, 0.7)).toBe(true);
    const sim = makeSim({ seed: 177, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    pin(sim, a, 10, 5);
    pin(sim, b, 10.5, 5);
    a.set(Aim, { x: 1, y: 0, holdTicks: 1 });
    sim.ecs.spawn(
      Projectile({
        kind: ProjectileKind.Melee,
        damage: 40,
        speed: 0,
        bounces: 0,
        fuse: 0,
        x: 10,
        y: 5,
        vx: 0,
        vy: 0,
        gravity: 0,
        ownerGrace: 0,
        defId: weaponIndex('pistol'),
      }),
      OwnedBy(a),
    );
    const hp = b.get(Health)?.hp ?? 100;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(b.get(Health)?.hp ?? 0).toBe(hp);
    expect(b.has(Dead)).toBe(false);
  });

  it('a beam with catalog beamTicks 0 does not use || 2', () => {
    const sim = makeSim({ seed: 178, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    pin(sim, a, 8, 5);
    pin(sim, b, 14, 5);
    a.set(Aim, { x: 1, y: 0, holdTicks: 1 });
    sim.ecs.spawn(
      Projectile({
        kind: ProjectileKind.Beam,
        damage: 40,
        speed: 0,
        bounces: 0,
        fuse: 0,
        x: 8,
        y: 5,
        vx: 0,
        vy: 0,
        gravity: 0,
        ownerGrace: 0,
        defId: weaponIndex('pistol'),
      }),
      OwnedBy(a),
    );
    const hp = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 4; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(b.get(Health)?.hp ?? 0).toBe(hp);
    expect(b.has(Dead)).toBe(false);
  });

  it('a laser with param3 = 0 does not fire a 14 m beam', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-laser'),
        id: 'laser-zero-reach',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'laser' as const, x: 2, y: 7, onTicks: 80, offTicks: 1, warningTicks: 0 },
        ],
      },
      seed: 179,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Laser) hz.param3 = 0;
    });
    pin(sim, p, 8, 7);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('laser with reach = 0 at create stays zero-length', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-laser'),
        id: 'laser-zero-reach-create',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          {
            type: 'laser' as const,
            x: 2,
            y: 7,
            onTicks: 80,
            offTicks: 1,
            warningTicks: 0,
            reach: 0,
          },
        ],
      },
      seed: 183,
      settings: { playerCount: 1 },
    });
    let reach = -1;
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Laser) reach = hz.param3;
    });
    expect(reach).toBe(0);
    const p = playerOf(sim);
    pin(sim, p, 8, 7);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('an omitted laser length still defaults to 14 at create', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-laser'),
        id: 'laser-omit-reach',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'laser' as const, x: 2, y: 7, onTicks: 80, offTicks: 1, warningTicks: 0 },
        ],
      },
      seed: 180,
      settings: { playerCount: 1 },
    });
    let reach = -1;
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Laser) reach = hz.param3;
    });
    expect(reach).toBe(14);
    const p = playerOf(sim);
    pin(sim, p, 8, 7);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead) || (p.get(Health)?.hp ?? 1) <= 0).toBe(true);
  });

  it('spikes kill across the authored bed, not only 0.7 from center', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-spikes'),
        id: 'spikes-wide-bed',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'spikes' as const, x: 12, y: 6, w: 6, dir: 'up' as const },
        ],
      },
      seed: 181,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    // 2.2 m from center: outside 0.7+0.3, inside authored half-width 3.
    pin(sim, p, 14.2, 6);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
  });

  it('spikes with param0 = 0 do not kill at the old 0.7 center reach', () => {
    const sim = makeSim({
      level: {
        ...getLevel('test-spikes'),
        id: 'spikes-zero-w',
        objects: [
          { type: 'solid' as const, x: 12, y: 1, w: 24, h: 2 },
          { type: 'spikes' as const, x: 12, y: 6, w: 4, dir: 'up' as const },
        ],
      },
      seed: 182,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    sim.ecs.query(Hazard).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Spikes) hz.param0 = 0;
    });
    pin(sim, p, 12, 6);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(false);
    expect(p.get(Health)?.hp ?? 1).toBeGreaterThan(0);
  });

  it('createSimWorld without boxes does not dump M0 crates onto a match arena', () => {
    const sim = makeSim({
      level: woodsClearing,
      seed: 46,
      settings: { playerCount: 2 },
    });
    expect(countKind(sim, HazardKind.Crate)).toBe(0);
    expect(leftoverProps(sim)).toBe(0);
  });
});
