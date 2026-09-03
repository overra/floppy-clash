import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { getLevel } from '../src/levels/catalog';
import { hitZoneAt } from '../src/sim/player/health';
import { spawnWeapon } from '../src/sim/systems/weapons';
import {
  Controller,
  Dead,
  Destructible,
  DropState,
  Hazard,
  HazardKind,
  Health,
  Held,
  HeldBy,
  Lifetime,
  Loose,
  RagdollPart,
  RoundPhase,
  RoundState,
  Status,
  Transform,
  Weapon,
} from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';

function countLoose(sim: ReturnType<typeof makeSim>): number {
  let n = 0;
  sim.ecs.query(Weapon, Loose).updateEach(() => {
    n += 1;
  });
  return n;
}

describe('PLAN gaps closed this audit', () => {
  it('sky drops wait firstDropDelay after countdown, not during it', () => {
    const sim = makeSim({
      level: woodsClearing,
      seed: 11,
      settings: { playerCount: 1 },
    });
    sim.ctx.tuning.countdownTicks = 12;
    sim.ctx.tuning.firstDropDelayTicks = 18;
    let fightingAt = -1;
    let firstSky = -1;
    for (let i = 0; i < 80; i++) {
      const ev = sim.step([hold({}), hold({}), hold({}), hold({})]);
      const phase = sim.ecs.get(RoundState)?.phase;
      if (fightingAt < 0 && phase === RoundPhase.Fighting) fightingAt = sim.ctx.tick;
      if (phase === RoundPhase.Countdown) {
        expect(countLoose(sim)).toBe(0);
      }
      if (firstSky < 0 && ev.some((e) => e.type === 'spawn' && String(e.kind).startsWith('weapon:'))) {
        firstSky = sim.ctx.tick;
      }
    }
    expect(fightingAt).toBeGreaterThan(0);
    expect(firstSky).toBeGreaterThanOrEqual(fightingAt + 18);
  });

  it('respects maxLooseWeapons and drops.enabled = false', () => {
    const cap = makeSim({ level: woodsClearing, seed: 12, settings: { playerCount: 1 } });
    cap.ecs.set(RoundState, {
      ...(cap.ecs.get(RoundState) ?? {
        phase: 0,
        ticks: 0,
        aliveMask: 0,
        lastKiller: -1,
        seed: 12,
      }),
      phase: RoundPhase.Fighting,
      ticks: 1,
    });
    for (let i = 0; i < cap.ctx.tuning.maxLooseWeapons; i++) {
      const gun = spawnWeapon(cap.ecs, 'pistol', 20 + i * 0.8, 10);
      const w = gun.get(Weapon)!;
      gun.set(Weapon, { ...w, pickupCooldown: 999 });
    }
    expect(countLoose(cap)).toBe(cap.ctx.tuning.maxLooseWeapons);
    cap.ecs.set(DropState, { nextDrop: cap.ctx.tick, looseCount: countLoose(cap) });
    for (let i = 0; i < 20; i++) cap.step([hold({}), hold({}), hold({}), hold({})]);
    expect(countLoose(cap)).toBe(cap.ctx.tuning.maxLooseWeapons);

    const off = makeSim({ level: getLevel('gym'), seed: 13, settings: { playerCount: 1 } });
    off.ecs.set(RoundState, {
      ...(off.ecs.get(RoundState) ?? {
        phase: 0,
        ticks: 0,
        aliveMask: 0,
        lastKiller: -1,
        seed: 13,
      }),
      phase: RoundPhase.Fighting,
      ticks: 1,
    });
    off.ecs.set(DropState, { nextDrop: off.ctx.tick, looseCount: 0 });
    const before = countLoose(off);
    for (let i = 0; i < 40; i++) off.step([hold({}), hold({}), hold({}), hold({})]);
    expect(countLoose(off)).toBe(before);
  });

  it('chain hangs a platform a player can stand on', () => {
    const sim = makeSim({
      level: getLevel('test-chain'),
      seed: 14,
      settings: { playerCount: 1 },
    });
    const plat = { x: 16, y: 0, found: false };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Chain && hz.param3 === 1) {
        plat.x = t.x;
        plat.y = t.y;
        plat.found = true;
      }
    });
    expect(plat.found).toBe(true);
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: plat.x, y: plat.y + 1.05 });
    p.set(Transform, { x: plat.x, y: plat.y + 1.05, angle: 0 });
    const ys: number[] = [];
    for (let i = 0; i < 50; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      ys.push(p.get(Transform)?.y ?? 0);
    }
    expect(Math.min(...ys)).toBeGreaterThan(plat.y + 0.35);
    expect(p.get(Controller)?.grounded || Math.min(...ys) > plat.y + 0.5).toBe(true);
  });

  it('destructible death spawns short-lived debris chunks', () => {
    const sim = makeSim({
      level: getLevel('test-block.destructible'),
      seed: 15,
      settings: { playerCount: 1 },
    });
    sim.ecs.query(Destructible, Hazard).updateEach(([d, hz]) => {
      if (hz.kind === HazardKind.Destructible) d.hp = 0;
    });
    const ev = sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(ev.some((e) => e.type === 'explosion')).toBe(true);
    let debris = 0;
    sim.ecs.query(Hazard, Lifetime).updateEach(([hz]) => {
      if (hz.kind === HazardKind.Debris) debris += 1;
    });
    expect(debris).toBeGreaterThanOrEqual(4);
  });

  it('ducking lowers the head zone (a standing headshot height is body)', () => {
    expect(hitZoneAt(0.7, 1.8, false)).toBe('head');
    expect(hitZoneAt(0.7, 1.8, true)).toBe('body');
  });

  it('a player can jump after landing on a loose weapon', () => {
    const sim = makeSim({ seed: 16, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const t = p.get(Transform)!;
    const gun = spawnWeapon(sim.ecs, 'rpg', t.x + 0.05, t.y - 0.12);
    const w = gun.get(Weapon)!;
    gun.set(Weapon, { ...w, pickupCooldown: 999 });
    let landed = false;
    for (let i = 0; i < 40; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (p.get(Controller)?.grounded) landed = true;
    }
    expect(landed).toBe(true);
    sim.step([hold({ jump: true }), hold({}), hold({}), hold({})]);
    expect(sim.ctx.bodies.get(p)?.getLinearVelocity().y ?? 0).toBeGreaterThan(6);
  });

  it('a living player can stand on a ragdoll corpse', () => {
    const sim = makeSim({ level: woodsClearing, seed: 17, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    b.set(Health, { hp: 0, maxHp: 100 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    const part = { x: 0, y: 0, ok: false };
    sim.ecs.query(RagdollPart, Transform).updateEach(([_r, t]) => {
      if (!part.ok) {
        part.x = t.x;
        part.y = t.y;
        part.ok = true;
      }
    });
    expect(part.ok).toBe(true);
    sim.ctx.bodies.get(a)?.setPosition({ x: part.x, y: part.y + 1.05 });
    a.set(Transform, { x: part.x, y: part.y + 1.05, angle: 0 });
    let grounded = false;
    for (let i = 0; i < 40; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      if (a.get(Controller)?.grounded) grounded = true;
    }
    expect(grounded).toBe(true);
    expect(a.has(Dead)).toBe(false);
  });

  it('blink dagger teleports the wielder forward', () => {
    const sim = makeSim({ seed: 18, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 10, y: 4 });
    p.set(Transform, { x: 10, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'blink-dagger', 10, 5);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    const x0 = p.get(Transform)?.x ?? 10;
    for (let i = 0; i < 6; i++) {
      sim.step([hold({ attack: i === 1, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect((p.get(Transform)?.x ?? 10) - x0).toBeGreaterThan(3);
  });

  it('flamethrower applies burn on a live hit', () => {
    const sim = makeSim({ seed: 19, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 11.1, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 11.1, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'flamethrower', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    for (let i = 0; i < 20; i++) {
      sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(b.get(Status)?.burning ?? 0).toBeGreaterThan(0);
  });
});
