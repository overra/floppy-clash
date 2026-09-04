import { universe } from 'koota';
import { describe, expect, it } from 'vitest';
import { matchLevelPool } from '../src/levels/catalog';
import { woodsClearing } from '../src/levels/handauthored';
import { LAUNCH_STAGES, skyhold } from '../src/levels/launch';
import { validateLevel } from '../src/levels/validate';
import { attachBots } from '../src/sim/ai/bots';
import { spawnPositions } from '../src/sim/level/spawns';
import { SeededRng } from '../src/core/rng';
import { Combat, Dead, Hazard, HazardKind, Health, Loose, MatchState, RoundPhase, RoundState, Status, Stocks, Transform, Weapon } from '../src/sim/traits';
import { createSimWorld } from '../src/sim/world';
import { hold, makeSim, playerOf, runTrack, stepMany } from './helpers';

const LAUNCH = { mode: 'launch' as const, playerCount: 2, bots: 0, stocks: 3, items: 'off' as const };

/** Two fighters toe to toe on the run track floor, A facing B. */
function faceOff(settings: Record<string, unknown> = {}) {
  const sim = makeSim({ level: runTrack, seed: 5, settings: { ...LAUNCH, ...settings } });
  const a = playerOf(sim, 0);
  const b = playerOf(sim, 1);
  sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
  sim.ctx.bodies.get(b)?.setPosition({ x: 20.8, y: 2.81 });
  for (let i = 0; i < 6; i++) sim.step([hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
  return { sim, a, b };
}

/** A lands one punch on B; returns B's velocity right after the hit lands. */
function punch(sim: ReturnType<typeof makeSim>, b: ReturnType<typeof playerOf>, victimInput = hold({ aimX: -1, aimY: 0 })) {
  let launched = { x: 0, y: 0 };
  for (let i = 0; i < 6; i++) {
    const ev = sim.step([hold({ attack: i === 0, aimX: 1, aimY: 0 }), victimInput, hold({}), hold({})]);
    if (ev.some((e) => e.type === 'hit')) {
      const v = sim.ctx.bodies.get(b)!.getLinearVelocity();
      launched = { x: v.x, y: v.y };
    }
  }
  return launched;
}

describe('launch mode: percent and knockback', () => {
  it('hits build percent and leave hp alone', () => {
    const { sim, b } = faceOff();
    punch(sim, b);
    const h = b.get(Health)!;
    expect(h.hp).toBe(100);
    expect(h.percent).toBeCloseTo(22, 5);
    expect(b.has(Dead)).toBe(false);
  });

  it('knockback grows with the victim percent', () => {
    const fresh = faceOff();
    const v0 = punch(fresh.sim, fresh.b);

    const worn = faceOff();
    worn.b.set(Health, { percent: 150 });
    const v1 = punch(worn.sim, worn.b);

    expect(Math.hypot(v1.x, v1.y)).toBeGreaterThan(Math.hypot(v0.x, v0.y) * 1.8);
    // 0.6 + 1.5 * 1.4 = 2.7x the base shove against 0.6x at 0%: several times harder, read after one
    // physics step (contact and gravity shave a little off).
    expect(v1.x / v0.x).toBeGreaterThan(3);
    expect(v1.x / v0.x).toBeLessThan(5);
  });

  it('a launched fighter is in hitstun that scales with the launch', () => {
    const light = faceOff();
    punch(light.sim, light.b);
    const stunLight = light.b.get(Combat)?.stun ?? 0;
    expect(stunLight).toBeGreaterThan(0);

    const heavy = faceOff();
    heavy.b.set(Health, { percent: 200 });
    punch(heavy.sim, heavy.b);
    expect(heavy.b.get(Combat)?.stun ?? 0).toBeGreaterThan(stunLight);
    // No steering while stunned: holding away does not slow the launch.
    const before = heavy.sim.ctx.bodies.get(heavy.b)!.getLinearVelocity().x;
    heavy.sim.step([hold({}), hold({ moveX: -1 }), hold({}), hold({})]);
    expect(heavy.sim.ctx.bodies.get(heavy.b)!.getLinearVelocity().x).toBeGreaterThan(before * 0.9);
  });

  it('directional influence bends the launch angle', () => {
    // Both victims are already staggered so the stick cannot move them; only DI can tell them apart.
    const neutral = faceOff();
    neutral.b.set(Health, { percent: 100 });
    neutral.b.set(Combat, { stun: 60 });
    const vn = punch(neutral.sim, neutral.b);

    const steered = faceOff();
    steered.b.set(Health, { percent: 100 });
    steered.b.set(Combat, { stun: 60 });
    const vs = punch(steered.sim, steered.b, hold({ aimX: -1, aimY: 0, moveX: -1 }));

    const angleN = Math.atan2(vn.y, vn.x);
    const angleS = Math.atan2(vs.y, vs.x);
    // Up to diMaxDeg (18°) at the hit, read after one physics step.
    expect(Math.abs(angleS - angleN)).toBeGreaterThan(0.15);
    expect(Math.abs(angleS - angleN)).toBeLessThan(0.4);
    // Same energy, different direction.
    expect(Math.hypot(vs.x, vs.y)).toBeCloseTo(Math.hypot(vn.x, vn.y), 0);
  });

  it('standing mode keeps the old fixed knockback and hp drain', () => {
    const { sim, b } = faceOff({ mode: 'standing' });
    const v = punch(sim, b);
    expect(b.get(Health)?.hp).toBeCloseTo(78, 5);
    expect(b.get(Health)?.percent).toBe(0);
    expect(v.x).toBeCloseTo(8, 0);
    expect(b.get(Combat)?.stun ?? 0).toBe(0);
  });
});

describe('launch mode: stocks, blast zone and respawn', () => {
  function fling(sim: ReturnType<typeof makeSim>, who: ReturnType<typeof playerOf>) {
    sim.ctx.bodies.get(who)?.setPosition({ x: -40, y: 4 });
    who.set(Transform, { x: -40, y: 4, angle: 0 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
  }

  it('the blast zone costs a stock and the fighter respawns immune, round still on', () => {
    const sim = makeSim({ settings: LAUNCH });
    const a = playerOf(sim, 0);
    a.set(Health, { percent: 80 });
    let stockEvents = 0;
    const ev0 = (() => {
      sim.ctx.bodies.get(a)?.setPosition({ x: -40, y: 4 });
      a.set(Transform, { x: -40, y: 4, angle: 0 });
      return sim.step([hold({}), hold({}), hold({}), hold({})]);
    })();
    stockEvents += ev0.filter((e) => e.type === 'stock').length;
    expect(stockEvents).toBe(1);
    expect(a.has(Dead)).toBe(true);
    expect(a.get(Stocks)?.left).toBe(2);
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);

    let respawned = false;
    for (let i = 0; i < sim.ctx.tuning.respawnDelayTicks + 2 && !respawned; i++) {
      const ev = sim.step([hold({}), hold({}), hold({}), hold({})]);
      respawned = ev.some((e) => e.type === 'respawn');
    }
    expect(respawned).toBe(true);
    expect(a.has(Dead)).toBe(false);
    expect(a.get(Health)?.percent).toBe(0);
    expect(a.get(Health)?.hp).toBe(100);
    expect(a.get(Status)?.invuln ?? 0).toBeGreaterThan(0);
    const t = a.get(Transform)!;
    expect(t.x).toBeGreaterThan(0);
    expect(t.x).toBeLessThan(52);
    expect(sim.ctx.bodies.get(a)).toBeDefined();
  });

  it('immunity swallows hits and shoves until it runs out', () => {
    const { sim, a, b } = faceOff();
    b.set(Status, { invuln: 30 });
    const v = punch(sim, b);
    expect(b.get(Health)?.percent).toBe(0);
    expect(Math.abs(v.x)).toBeLessThan(0.5);
    void a;
    stepMany(sim, 40, [hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
    expect(b.get(Status)?.invuln).toBe(0);
    punch(sim, b);
    expect(b.get(Health)?.percent).toBeGreaterThan(0);
  });

  it('the last stock ends the round for the survivor', () => {
    const sim = makeSim({ settings: { ...LAUNCH, stocks: 1 } });
    const a = playerOf(sim, 0);
    fling(sim, a);
    expect(a.get(Stocks)?.left).toBe(0);
    const round = sim.ecs.get(RoundState)!;
    expect(round.phase).toBe(RoundPhase.LastKill);
    expect(round.winner).toBe(1);
    expect(sim.ecs.get(MatchState)?.wins1).toBe(1);
  });

  it('a round is not over while the fallen fighter still has stocks', () => {
    const sim = makeSim({ settings: { ...LAUNCH, stocks: 2 } });
    const a = playerOf(sim, 0);
    fling(sim, a);
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.Fighting);
    // Back in, then out for good.
    stepMany(sim, sim.ctx.tuning.respawnDelayTicks + 5);
    expect(a.has(Dead)).toBe(false);
    fling(sim, a);
    expect(sim.ecs.get(RoundState)?.phase).toBe(RoundPhase.LastKill);
    expect(sim.ecs.get(RoundState)?.winner).toBe(1);
  });

  it('a new round hands every fighter their stocks back', () => {
    const sim = makeSim({ settings: { ...LAUNCH, stocks: 1 } });
    sim.ctx.tuning.slowmoTicks = 2;
    sim.ctx.tuning.scoreboardTicks = 2;
    sim.ctx.tuning.countdownTicks = 2;
    const a = playerOf(sim, 0);
    a.set(Health, { percent: 70 });
    fling(sim, a);
    stepMany(sim, 12);
    expect(sim.ecs.get(MatchState)?.round).toBe(1);
    expect(a.has(Dead)).toBe(false);
    expect(a.get(Stocks)?.left).toBe(1);
    expect(a.get(Health)?.percent).toBe(0);
  });

  it('match state carries the mode and stock count for the HUD', () => {
    const sim = makeSim({ settings: LAUNCH });
    expect(sim.ecs.get(MatchState)?.mode).toBe(1);
    expect(sim.ecs.get(MatchState)?.stocks).toBe(3);
    const standing = makeSim({ settings: { playerCount: 2 } });
    expect(standing.ecs.get(MatchState)?.mode).toBe(0);
  });
});

describe('launch stages', () => {
  it('ship open-air, validator-clean, and are what launch mode rotates through by default', () => {
    expect(LAUNCH_STAGES.length).toBeGreaterThanOrEqual(3);
    for (const stage of LAUNCH_STAGES) {
      expect(validateLevel(stage)).toEqual([]);
      expect(stage.tags).toContain('launch');
      // Open air on both sides and underneath: no solid reaches the bounds' edges or floor.
      for (const o of stage.objects) {
        const w = o.w ?? 0;
        expect(o.x - w / 2).toBeGreaterThan(stage.bounds.x + 2);
        expect(o.x + w / 2).toBeLessThan(stage.bounds.x + stage.bounds.w - 2);
        expect(o.y - (o.h ?? 0) / 2).toBeGreaterThan(stage.bounds.y + 1);
      }
    }
    const launchPool = matchLevelPool('all', [], 'launch');
    expect(launchPool.map((l) => l.id).sort()).toEqual(LAUNCH_STAGES.map((l) => l.id).sort());
    // Standing mode keeps the whole catalogue, and an explicit pick is honoured in either mode.
    expect(matchLevelPool('all', [], 'standing').length).toBeGreaterThan(LAUNCH_STAGES.length);
    expect(matchLevelPool(['woods-01'], [], 'launch').map((l) => l.id)).toEqual(['woods-01']);
  });

  it('four bots settle a melee-only launch round on an island inside two minutes', () => {
    universe.reset();
    const sim = createSimWorld({ level: skyhold, seed: 3, settings: { mode: 'launch', playerCount: 0, bots: 4, stocks: 3, items: 'off' } });
    attachBots(sim.ecs, [0, 1, 2, 3]);
    let stocksLost = 0;
    let resolved = -1;
    for (let t = 0; t < 60 * 120 && resolved < 0; t++) {
      for (const ev of sim.step()) if (ev.type === 'stock') stocksLost += 1;
      if ((sim.ecs.get(RoundState)?.phase ?? 0) >= RoundPhase.LastKill) resolved = t;
    }
    expect(resolved).toBeGreaterThan(0);
    // Three fighters out of stocks; the fourth is crowned.
    expect(stocksLost).toBeGreaterThanOrEqual(9);
    expect(sim.ecs.get(RoundState)?.winner).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe('item, hazard and spawn switches', () => {
  it('items off: nothing rains even on a level with drops', () => {
    const sim = makeSim({ level: woodsClearing, seed: 3, settings: { playerCount: 2, items: 'off' } });
    stepMany(sim, 600);
    let loose = 0;
    sim.ecs.query(Weapon, Loose).forEach(() => (loose += 1));
    expect(loose).toBe(0);
  });

  it('items normal on the same level does rain', () => {
    const sim = makeSim({ level: woodsClearing, seed: 3, settings: { playerCount: 2, items: 'normal' } });
    stepMany(sim, 600);
    let loose = 0;
    sim.ecs.query(Weapon, Loose).forEach(() => (loose += 1));
    expect(loose).toBeGreaterThan(0);
  });

  it('items low drops later than normal', () => {
    const firstDrop = (items: 'low' | 'normal') => {
      const sim = makeSim({ level: woodsClearing, seed: 3, settings: { playerCount: 2, items } });
      for (let i = 0; i < 2000; i++) {
        const ev = sim.step([hold({}), hold({}), hold({}), hold({})]);
        if (ev.some((e) => e.type === 'spawn' && e.kind.startsWith('weapon:'))) return i;
      }
      return Infinity;
    };
    expect(firstDrop('low')).toBeGreaterThan(firstDrop('normal'));
  });

  it('hazards off strips spikes and the rest, keeps the ground', () => {
    const neutral = makeSim({ level: woodsClearing, seed: 3, settings: { playerCount: 2, hazards: false } });
    const kinds = new Set<number>();
    neutral.ecs.query(Hazard).updateEach(([hz]) => kinds.add(hz.kind));
    expect(kinds.has(HazardKind.Spikes)).toBe(false);
    expect([...kinds].every((k) => k === HazardKind.Solid || k === HazardKind.MovingPlatform)).toBe(true);
    expect(neutral.ctx.level.objects.length).toBeLessThan(woodsClearing.objects.length);

    const full = makeSim({ level: woodsClearing, seed: 3, settings: { playerCount: 2, hazards: true } });
    const fullKinds = new Set<number>();
    full.ecs.query(Hazard).updateEach(([hz]) => fullKinds.add(hz.kind));
    expect(fullKinds.has(HazardKind.Spikes)).toBe(true);
  });

  it('fixed spawns seat slot k on spawn point k', () => {
    const spawns = [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    const fixed = spawnPositions(spawns, 4, new SeededRng(9), true);
    expect(fixed.map((s) => s.x)).toEqual([1, 2, 3, 4]);
    const sim = makeSim({ settings: { playerCount: 4, fixedSpawns: true } });
    const xs = [0, 1, 2, 3].map((s) => playerOf(sim, s).get(Transform)!.x);
    expect(xs).toEqual([14, 20, 36, 44]);
  });
});
