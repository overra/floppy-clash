import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { getLevel } from '../src/levels/catalog';
import { hitZoneAt } from '../src/sim/player/health';
import { heldHandPose, spawnWeapon } from '../src/sim/systems/weapons';
import { inMeleeArc } from '../src/sim/weapons/projectiles';
import { spawnSnake } from '../src/sim/weapons/projectiles';
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
  Snake,
  Status,
  Transform,
  Weapon,
} from '../src/sim/traits';
import { droppableWeapons } from '../src/sim/weapons/defs';
import { hold, makeSim, playerOf } from './helpers';

function countLoose(sim: ReturnType<typeof makeSim>): number {
  let n = 0;
  sim.ecs.query(Weapon, Loose).updateEach(() => {
    n += 1;
  });
  return n;
}

describe('PLAN gaps closed this audit', () => {
  it('editor angle is applied to the physics body (PLAN 4.15)', () => {
    const level = {
      ...woodsClearing,
      id: 'tilt-slab',
      objects: [
        { type: 'solid' as const, x: 16, y: 1, w: 32, h: 2 },
        { type: 'solid' as const, x: 16, y: 6, w: 8, h: 1, angle: 0.35 },
      ],
    };
    const sim = makeSim({ level, seed: 501, settings: { playerCount: 1 } });
    const tilted = { angle: 0, found: false };
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t], e) => {
      if (hz.kind !== HazardKind.Solid || Math.abs(t.y - 6) > 0.2) return;
      tilted.angle = sim.ctx.bodies.get(e)?.getAngle() ?? 0;
      tilted.found = true;
    });
    expect(tilted.found).toBe(true);
    expect(tilted.angle).toBeCloseTo(0.35, 2);
  });

  it('enabledWeapons filters the sky-drop pool (PLAN 4.9)', () => {
    expect(droppableWeapons(['pistol']).map((d) => d.id)).toEqual(['pistol']);
    expect(droppableWeapons(['rpg']).every((d) => d.id === 'rpg')).toBe(true);
    expect(droppableWeapons([]).length).toBe(0);
  });

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
    for (let i = 0; i < 40; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
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
    const standY = plat.y + 1.25;
    sim.ctx.bodies.get(p)?.setPosition({ x: plat.x, y: standY });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    p.set(Transform, { x: plat.x, y: standY, angle: 0 });
    let grounded = false;
    const ys: number[] = [];
    for (let i = 0; i < 50; i++) {
      sim.step([hold({}), hold({}), hold({}), hold({})]);
      ys.push(p.get(Transform)?.y ?? 0);
      if (p.get(Controller)?.grounded) grounded = true;
    }
    let liveY = plat.y;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Chain && hz.param3 === 1) liveY = t.y;
    });
    expect(Math.min(...ys)).toBeGreaterThan(5);
    expect(p.get(Transform)?.y ?? 0).toBeGreaterThan(liveY);
    expect(grounded).toBe(true);
  });

  it('loose weapon Transform tracks the falling body', () => {
    const sim = makeSim({ seed: 21, settings: { playerCount: 1 } });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10, 12);
    for (let i = 0; i < 45; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const t = gun.get(Transform)!;
    const body = sim.ctx.bodies.get(gun)!.getPosition();
    expect(t.y).toBeCloseTo(body.y, 2);
    expect(t.y).toBeLessThan(8);
  });

  it('pickup uses the landed pose, not the sky spawn', () => {
    const sim = makeSim({ seed: 23, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 8, y: 4 });
    p.set(Transform, { x: 8, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 46, 16);
    for (let i = 0; i < 50; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(gun.has(Held)).toBe(false);
    const wt = gun.get(Transform)!;
    expect(wt.y).toBeLessThan(6);
    expect(wt.x).toBeGreaterThan(40);
    sim.ctx.bodies.get(p)?.setPosition({ x: wt.x, y: wt.y + 0.45 });
    p.set(Transform, { x: wt.x, y: wt.y + 0.45, angle: 0 });
    for (let i = 0; i < 12; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(gun.has(Held)).toBe(true);
  });

  it('snake Transform tracks the creature body', () => {
    const sim = makeSim({ seed: 22, settings: { playerCount: 1 } });
    spawnSnake(sim.ecs, 10, 10, undefined, false, false);
    for (let i = 0; i < 30; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const seen = { y: 10, bodyY: 10, ok: false };
    sim.ecs.query(Snake, Transform).updateEach(([_s, t], e) => {
      const body = sim.ctx.bodies.get(e);
      if (!body) return;
      seen.y = t.y;
      seen.bodyY = body.getPosition().y;
      seen.ok = true;
    });
    expect(seen.ok).toBe(true);
    expect(seen.y).toBeCloseTo(seen.bodyY, 2);
    expect(Math.abs(seen.y - 10)).toBeGreaterThan(0.05);
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

  it('blink dagger damages at the destination on the same tick', () => {
    const sim = makeSim({ seed: 405, settings: { playerCount: 2 } });
    const a = playerOf(sim, 0);
    const b = playerOf(sim, 1);
    sim.ctx.bodies.get(a)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(b)?.setPosition({ x: 14, y: 4 });
    a.set(Transform, { x: 10, y: 4, angle: 0 });
    b.set(Transform, { x: 14, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'blink-dagger', 10, 5);
    gun.add(Held(), HeldBy(a));
    gun.remove(Loose);
    const hp0 = b.get(Health)?.hp ?? 100;
    for (let i = 0; i < 6; i++) {
      sim.step([
        hold({ attack: i === 1, aimX: 1, aimY: 0 }),
        hold({}),
        hold({}),
        hold({}),
      ]);
    }
    expect((a.get(Transform)?.x ?? 10)).toBeGreaterThan(13);
    expect((b.get(Health)?.hp ?? 100)).toBeLessThan(hp0);
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

  it('held weapon Transform is this tick\'s hand, not last tick\'s pose', () => {
    const sim = makeSim({ seed: 401, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 10, y: 4 });
    p.set(Transform, { x: 10, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'pistol', 10.05, 4.15);
    for (let i = 0; i < 16; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(gun.has(Held)).toBe(true);
    expect(sim.ctx.bodies.get(gun)?.isActive()).toBe(false);
    sim.ctx.bodies.get(p)?.setPosition({ x: 16, y: 6 });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    p.set(Transform, { x: 16, y: 6, angle: 0 });
    sim.step([hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    const wt = gun.get(Transform)!;
    const pt = p.get(Transform)!;
    const hand = heldHandPose(pt, { x: 1, y: 0 }, 0.45);
    expect(Math.hypot(wt.x - hand.x, wt.y - hand.y)).toBeLessThan(0.04);
    expect(wt.x).toBeGreaterThan(pt.x + 0.3);
    const body = sim.ctx.bodies.get(gun)!.getPosition();
    expect(body.x).toBeCloseTo(wt.x, 3);
    expect(body.y).toBeCloseTo(wt.y, 3);
  });

  it('melee hits a short forward arc and misses behind the wielder', () => {
    expect(inMeleeArc(10, 4, 1, 0, 10.55, 4.45, 0.7)).toBe(true);
    expect(inMeleeArc(10, 4, 1, 0, 9.1, 4, 0.7)).toBe(false);
    expect(inMeleeArc(10, 4, 1, 0, 9.85, 4, 0.7)).toBe(false);
    expect(inMeleeArc(10, 4, 1, 0, 10, 4.65, 0.7)).toBe(false);

    const hit = makeSim({ seed: 407, settings: { playerCount: 2 } });
    const ha = playerOf(hit, 0);
    const hb = playerOf(hit, 1);
    hit.ctx.bodies.get(ha)?.setPosition({ x: 10, y: 4 });
    hit.ctx.bodies.get(hb)?.setPosition({ x: 10.55, y: 4.45 });
    ha.set(Transform, { x: 10, y: 4, angle: 0 });
    hb.set(Transform, { x: 10.55, y: 4.45, angle: 0 });
    const sword = spawnWeapon(hit.ecs, 'sword', 10, 5);
    sword.add(Held(), HeldBy(ha));
    sword.remove(Loose);
    const hpHit = hb.get(Health)?.hp ?? 100;
    hit.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect((hb.get(Health)?.hp ?? 100)).toBeLessThan(hpHit);

    const miss = makeSim({ seed: 408, settings: { playerCount: 2 } });
    const ma = playerOf(miss, 0);
    const mb = playerOf(miss, 1);
    miss.ctx.bodies.get(ma)?.setPosition({ x: 10, y: 4 });
    miss.ctx.bodies.get(mb)?.setPosition({ x: 9.85, y: 4 });
    ma.set(Transform, { x: 10, y: 4, angle: 0 });
    mb.set(Transform, { x: 9.85, y: 4, angle: 0 });
    const blade = spawnWeapon(miss.ecs, 'sword', 10, 5);
    blade.add(Held(), HeldBy(ma));
    blade.remove(Loose);
    const hpMiss = mb.get(Health)?.hp ?? 100;
    miss.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(mb.get(Health)?.hp ?? 100).toBe(hpMiss);
  });

  it('sword lunge applies forward impulse along aim Y', () => {
    const sim = makeSim({ seed: 402, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 10, y: 4 });
    sim.ctx.bodies.get(p)?.setLinearVelocity({ x: 0, y: 0 });
    p.set(Transform, { x: 10, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'sword', 10, 5);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
    expect(sim.ctx.bodies.get(p)?.getLinearVelocity().y ?? 0).toBeGreaterThan(4);
  });

  it('hung chain platform is a dynamic revolute-jointed body', () => {
    const sim = makeSim({
      level: getLevel('test-chain'),
      seed: 406,
      settings: { playerCount: 1 },
    });
    for (let i = 0; i < 8; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const deck = { type: '', ok: false };
    sim.ecs.query(Hazard).updateEach(([hz], e) => {
      if (hz.kind !== HazardKind.Chain || hz.param3 !== 1) return;
      deck.type = sim.ctx.bodies.get(e)?.getType() ?? '';
      deck.ok = true;
    });
    expect(deck.ok).toBe(true);
    expect(deck.type).toBe('dynamic');
  });

  it('breaking every chain link drops the hung platform', () => {
    const sim = makeSim({
      level: getLevel('test-chain'),
      seed: 403,
      settings: { playerCount: 1 },
    });
    for (let i = 0; i < 20; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let y0 = 0;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Chain && hz.param3 === 1) y0 = t.y;
    });
    expect(y0).toBeGreaterThan(2);
    sim.ecs.query(Destructible, Hazard).updateEach(([d, hz]) => {
      if (hz.kind === HazardKind.Chain && hz.param3 !== 1) d.hp = 0;
    });
    for (let i = 0; i < 50; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    let y1 = y0;
    sim.ecs.query(Hazard, Transform).updateEach(([hz, t]) => {
      if (hz.kind === HazardKind.Chain && hz.param3 === 1) y1 = t.y;
    });
    expect(y1).toBeLessThan(y0 - 0.25);
  });

  it('death drops a held weapon as a loose body', () => {
    const sim = makeSim({ seed: 404, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const gun = spawnWeapon(sim.ecs, 'pistol', 8, 6);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    p.set(Health, { hp: 0, maxHp: 100 });
    sim.step([hold({}), hold({}), hold({}), hold({})]);
    expect(p.has(Dead)).toBe(true);
    expect(gun.has(Held)).toBe(false);
    expect(gun.has(Loose)).toBe(true);
  });
});
