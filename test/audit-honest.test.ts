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
import { hold, makeSim, place, playerOf, speedRounds } from './helpers';

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
    const sim = makeSim({
      level: getLevel('test-saw-path'),
      seed: 40,
      settings: { playerCount: 1 },
    });
    const p = playerOf(sim);
    place(sim, p, 14, 5);
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
    const span = { prev: 8, now: 8, ok: false };
    sim.ecs.query(Hazard, Transform, PrevTransform).updateEach(([hz, t, prev], e) => {
      if (hz.kind !== HazardKind.Saw) return;
      span.prev = prev.x;
      span.now = t.x;
      span.ok = true;
      sim.ctx.bodies.get(e)?.setLinearVelocity({ x: 0, y: 0 });
    });
    expect(span.ok).toBe(true);
    expect(Math.min(span.prev, span.now)).toBeLessThan(14);
    expect(Math.max(span.prev, span.now)).toBeGreaterThan(14);
    place(sim, p, 14, 5);
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(true);
    expect(p.get(Health)?.hp ?? 1).toBeLessThanOrEqual(0);
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
    place(sim, p, 8, 3);
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 480 });
    sim.ctx.holdHazards = true;
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    sim.ctx.holdHazards = false;
    const prev = p.get(PrevTransform);
    const now = p.get(Transform);
    expect(prev?.y ?? 7).toBeLessThan(6);
    expect(now?.y ?? 3).toBeGreaterThan(8);
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

  it('desert crate stacks spawn and topple when the base is pushed', () => {
    const sim = makeSim({
      level: getLevel('desert-01'),
      seed: 44,
      settings: { playerCount: 1 },
    });
    expect(countKind(sim, HazardKind.Crate)).toBeGreaterThanOrEqual(4);
    const top = { x: 0, y: 0, angle: 0, found: false };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind !== HazardKind.Crate) return;
      if (!top.found || t.y > top.y) {
        top.x = t.x;
        top.y = t.y;
        top.angle = t.angle;
        top.found = true;
      }
    });
    expect(top.found).toBe(true);
    const p = playerOf(sim);
    place(sim, p, 11.1, 3.2);
    for (let i = 0; i < 80; i++) sim.step([hold({ moveX: 1 }), hold({}), hold({}), hold({})]);
    let y1 = top.y;
    let a1 = top.angle;
    let x1 = top.x;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind !== HazardKind.Crate) return;
      if (Math.abs(t.x - top.x) < 1.2 && t.y >= top.y - 0.4) {
        y1 = t.y;
        a1 = t.angle;
        x1 = t.x;
      }
    });
    expect(y1 < top.y - 0.12 || Math.abs(a1 - top.angle) > 0.08 || Math.abs(x1 - top.x) > 0.25).toBe(
      true,
    );
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
