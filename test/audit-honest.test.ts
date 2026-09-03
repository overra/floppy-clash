import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { woodsClearing } from '../src/levels/handauthored';
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
import { freezeHazardKinematics, hold, makeSim, place, playerOf, speedRounds } from './helpers';

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
    const mid = (span.prev + span.now) / 2;
    place(sim, p, mid, span.y);
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
    place(sim, p, (span.prev + span.now) / 2, span.y);
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
    expect(Math.abs(span.now - span.prev)).toBeGreaterThan(0.4);
    const mid = (span.prev + span.now) / 2;
    sim.ctx.holdHazards = false;
    freezeHazardKinematics(sim, HazardKind.Crusher);
    place(sim, p, mid, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = { now: span.now };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Crusher) after.now = t.x;
    });
    expect(Math.abs(after.now - span.now)).toBeLessThan(0.08);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
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
    expect(Math.abs(span.now - span.prev)).toBeGreaterThan(0.4);
    const mid = (span.prev + span.now) / 2;
    sim.ctx.holdHazards = false;
    freezeHazardKinematics(sim, HazardKind.Spikeball);
    place(sim, p, mid, span.y);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const after = { now: span.now };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Spikeball) after.now = t.x;
    });
    expect(Math.abs(after.now - span.now)).toBeLessThan(0.08);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
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
