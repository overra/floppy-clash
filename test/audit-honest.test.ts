import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { woodsClearing } from '../src/levels/handauthored';
import { diskSweepsPlayer } from '../src/sim/hazards/common';
import { crusherOverlaps } from '../src/sim/hazards/crusher';
import { sawOverlaps } from '../src/sim/hazards/saw';
import { nextMatchLevel } from '../src/sim/systems/reset';
import {
  Dead,
  Hazard,
  HazardKind,
  Health,
  MatchState,
  PhysBody,
  Player,
  PrevTransform,
  RoundPhase,
  RoundState,
  Transform,
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
