import { universe } from 'koota';
import { describe, expect, it } from 'vitest';
import { readPad, emptyLatch } from '../src/input/gamepad';
import { createRecorder } from '../src/input/replay';
import { attachBots } from '../src/sim/ai/bots';
import { chooseStrike, strikeDef } from '../src/sim/player/strikes';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { Combat, Health, StrikeKind, Transform } from '../src/sim/traits';
import { tuning } from '../src/sim/tuning';
import { createSimWorld } from '../src/sim/world';
import { hold, makeSim, playerOf, runTrack, skyhold, stepMany } from './helpers';

/** Two fighters on the run track floor, A facing B at `gap` metres. */
function faceOff(gap = 0.8, settings: Record<string, unknown> = {}) {
  const sim = makeSim({ level: runTrack, seed: 5, settings: { playerCount: 2, bots: 0, items: 'off', ...settings } });
  const a = playerOf(sim, 0);
  const b = playerOf(sim, 1);
  sim.ctx.bodies.get(a)?.setPosition({ x: 20, y: 2.81 });
  sim.ctx.bodies.get(b)?.setPosition({ x: 20 + gap, y: 2.81 });
  for (let i = 0; i < 6; i++) sim.step([hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
  return { sim, a, b };
}

/**
 * A presses `button` once (with `moveX` held) and the sim runs until the strike has resolved. Reports
 * the tick the hit landed on, B's velocity on that tick, and A's cooldown right after the press.
 */
function strike(sim: ReturnType<typeof makeSim>, button: 'attack' | 'kick', moveX = 0, victim = hold({ aimX: -1, aimY: 0 }), ticks = 12) {
  const events: string[] = [];
  const b = playerOf(sim, 1);
  const a = playerOf(sim, 0);
  let landedAt = -1;
  let launched = { x: 0, y: 0 };
  let cooldown = 0;
  for (let i = 0; i < ticks; i++) {
    const press = i === 0;
    const ev = sim.step([hold({ [button]: press, moveX: press ? moveX : 0, aimX: 1, aimY: 0 }), victim, hold({}), hold({})]);
    if (press) cooldown = a.get(Combat)?.strikeCooldown ?? 0;
    for (const e of ev) {
      events.push(e.type);
      if (e.type === 'hit' && landedAt < 0) {
        landedAt = i;
        const v = sim.ctx.bodies.get(b)?.getLinearVelocity();
        if (v) launched = { x: v.x, y: v.y };
      }
    }
  }
  return { events, landedAt, launched, cooldown };
}

describe('strike table', () => {
  it('two buttons and the stick pick four strikes', () => {
    expect(chooseStrike(false, 0, 1)).toBe(StrikeKind.Jab);
    expect(chooseStrike(false, 1, 1)).toBe(StrikeKind.Cross);
    expect(chooseStrike(false, -1, 1)).toBe(StrikeKind.Jab);
    expect(chooseStrike(false, -1, -1)).toBe(StrikeKind.Cross);
    expect(chooseStrike(true, 0, 1)).toBe(StrikeKind.FrontKick);
    expect(chooseStrike(true, 1, 1)).toBe(StrikeKind.Roundhouse);
  });

  it('the jab is the original punch; rear and kicking strikes trade speed for reach and power', () => {
    const jab = strikeDef(tuning, StrikeKind.Jab);
    expect(jab.damage).toBe(tuning.punchDamage);
    expect(jab.knockback).toBe(tuning.punchKnockback);
    expect(jab.reach).toBe(tuning.punchRange);
    expect(jab.windup).toBe(2);
    const cross = strikeDef(tuning, StrikeKind.Cross);
    const kick = strikeDef(tuning, StrikeKind.FrontKick);
    const round = strikeDef(tuning, StrikeKind.Roundhouse);
    expect(cross.windup).toBeGreaterThan(jab.windup);
    expect(cross.damage).toBeGreaterThan(jab.damage);
    expect(cross.cooldown).toBeGreaterThan(jab.cooldown);
    expect(kick.windup).toBeGreaterThan(jab.windup);
    expect(kick.reach).toBeGreaterThan(jab.reach);
    expect(kick.knockback).toBeGreaterThan(jab.knockback);
    expect(kick.guardDrain).toBeGreaterThan(0);
    expect(round.damage).toBeGreaterThan(kick.damage);
    expect(round.windup).toBeGreaterThan(kick.windup);
  });
});

describe('punches and kicks', () => {
  it('a kick lands for kick damage with kick knockback', () => {
    const { sim, b } = faceOff();
    const { landedAt, launched } = strike(sim, 'kick');
    expect(landedAt).toBe(tuning.kickWindupTicks);
    expect(b.get(Health)?.hp).toBeCloseTo(100 - tuning.kickDamage, 5);
    expect(launched.x).toBeGreaterThan(tuning.punchKnockback);
  });

  it('a kick reaches where a punch whiffs', () => {
    const far = faceOff(1.65);
    strike(far.sim, 'attack');
    expect(far.b.get(Health)?.hp).toBe(100);
    const farKick = faceOff(1.65);
    strike(farKick.sim, 'kick');
    expect(farKick.b.get(Health)?.hp).toBeLessThan(100);
  });

  it('stepping into a punch throws the slower, harder cross', () => {
    const jab = faceOff();
    const j = strike(jab.sim, 'attack', 0);
    expect(j.landedAt).toBe(2);
    expect(jab.b.get(Health)?.hp).toBeCloseTo(100 - tuning.punchDamage, 5);

    const cross = faceOff();
    const c = strike(cross.sim, 'attack', 1);
    expect(c.landedAt).toBe(2 + tuning.rearWindupTicks);
    expect(cross.b.get(Health)?.hp).toBeCloseTo(100 - tuning.punchDamage * tuning.rearDamageScale, 5);
    expect(c.cooldown).toBeGreaterThan(j.cooldown);
  });

  it('backing away keeps the jab, so retreating pokes stay quick', () => {
    const { sim, b } = faceOff();
    const { landedAt } = strike(sim, 'attack', -1);
    expect(landedAt).toBe(2);
    expect(b.get(Health)?.hp).toBeCloseTo(100 - tuning.punchDamage, 5);
  });

  it('kick and punch thrown together clash', () => {
    const { sim, a, b } = faceOff();
    let clashes = 0;
    for (let i = 0; i < 10; i++) {
      const ev = sim.step([hold({ kick: i === 0, aimX: 1, aimY: 0 }), hold({ attack: i === 3, aimX: -1, aimY: 0 }), hold({}), hold({})]);
      clashes += ev.filter((e) => e.type === 'clash').length;
    }
    expect(clashes).toBe(1);
    expect(a.get(Health)?.hp).toBe(100);
    expect(b.get(Health)?.hp).toBe(100);
  });

  it('armed fighters neither punch nor kick', () => {
    const { sim, a, b } = faceOff();
    spawnWeapon(sim.ecs, 'pistol', 20, 3.2);
    stepMany(sim, 40, [hold({ aimX: 1, aimY: 0 }), hold({ aimX: -1, aimY: 0 }), hold({}), hold({})]);
    const kicked = strike(sim, 'kick');
    expect(kicked.events.filter((e) => e === 'punch')).toHaveLength(0);
    expect(a.get(Combat)?.strike).toBe(StrikeKind.None);
    void b;
  });
});

describe('kicks against the guard', () => {
  function guardUp(gap = 0.8) {
    const ctx = faceOff(gap);
    // B raises the guard well ahead of time so this is an ordinary (non-perfect) block.
    for (let i = 0; i < 15; i++) ctx.sim.step([hold({ aimX: 1, aimY: 0 }), hold({ block: true, aimX: -1, aimY: 0 }), hold({}), hold({})]);
    return ctx;
  }
  const blocking = hold({ block: true, aimX: -1, aimY: 0 });

  it('a punch into a settled guard staggers the puncher; a kick leans on it and drains the meter instead', () => {
    const p = guardUp();
    const meterBeforeP = p.b.get(Combat)!.blockMeter;
    strike(p.sim, 'attack', 0, blocking, 4);
    expect(p.a.get(Combat)?.stun ?? 0).toBeGreaterThan(10);
    expect(p.b.get(Combat)!.blockMeter).toBeGreaterThan(meterBeforeP - 0.1);

    const k = guardUp();
    const meterBeforeK = k.b.get(Combat)!.blockMeter;
    strike(k.sim, 'kick', 0, blocking, tuning.kickWindupTicks + 1);
    expect(k.b.get(Health)?.hp).toBe(100);
    expect(k.b.get(Combat)!.blockMeter).toBeLessThan(meterBeforeK - tuning.kickGuardDrain * 0.8);
    expect(k.a.get(Combat)?.stun ?? 0).toBeLessThanOrEqual(Math.round(18 / 2));
    expect(k.a.get(Combat)?.stun ?? 0).toBeGreaterThan(0);
  });

  it('kicks break a worn guard: the blocker is knocked open and staggered', () => {
    const { sim, a, b } = guardUp();
    b.set(Combat, { blockMeter: tuning.kickGuardDrain * 0.5 });
    let blocks = 0;
    let clashes = 0;
    for (let i = 0; i < tuning.kickWindupTicks + 2; i++) {
      const ev = sim.step([hold({ kick: i === 0, aimX: 1, aimY: 0 }), blocking, hold({}), hold({})]);
      blocks += ev.filter((e) => e.type === 'block').length;
      clashes += ev.filter((e) => e.type === 'clash').length;
    }
    expect(blocks).toBe(1);
    expect(clashes).toBe(1);
    expect(b.get(Health)?.hp).toBe(100);
    expect(b.get(Combat)?.blocking).toBe(false);
    expect(b.get(Combat)?.stun ?? 0).toBeGreaterThanOrEqual(tuning.guardBreakStunTicks - 2);
    expect(b.get(Combat)?.blockMeter).toBe(0);
    expect(a.get(Combat)?.stun ?? 0).toBe(0);
    expect(sim.ctx.bodies.get(b)!.getLinearVelocity().x).toBeGreaterThan(1);
  });

  it('a perfect block stops a kick cold and leaves the kicker open', () => {
    const { sim, a, b } = faceOff();
    let blocks = 0;
    // Guard goes up on the tick the kick is thrown: it lands inside the perfect window.
    for (let i = 0; i < tuning.kickWindupTicks + 2; i++) {
      const ev = sim.step([hold({ kick: i === 0, aimX: 1, aimY: 0 }), hold({ block: i >= 0, aimX: -1, aimY: 0 }), hold({}), hold({})]);
      blocks += ev.filter((e) => e.type === 'block' && e.reflected).length;
    }
    expect(blocks).toBe(1);
    expect(b.get(Health)?.hp).toBe(100);
    expect(a.get(Combat)?.stun ?? 0).toBeGreaterThan(20);
  });
});

describe('kick input plumbing', () => {
  it('RB kicks on the standard layout and no longer doubles as attack; remaps can move it', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    buttons[5] = { pressed: true, touched: true, value: 1 };
    const pad = { axes: [0, 0, 0, 0], buttons, mapping: 'standard' } as unknown as Gamepad;
    const input = readPad(pad, emptyLatch(), { x: 0, y: 0 });
    expect(input.kick).toBe(true);
    expect(input.attack).toBe(false);
    const remapped = readPad(pad, emptyLatch(), { x: 0, y: 0 }, { jump: 0, attack: 5, kick: 7, block: 6, throw: 3, pause: 9 });
    expect(remapped.attack).toBe(true);
    expect(remapped.kick).toBe(false);
  });

  it('the replay tape keeps the kick bit', () => {
    const rec = createRecorder(1, 'gym');
    rec.push([hold({ kick: true, attack: true }), hold({ kick: false })]);
    const tape = rec.toJSON();
    expect(tape.inputs[0]![0]!.kick).toBe(true);
    expect(tape.inputs[0]![0]!.attack).toBe(true);
    expect(tape.inputs[0]![1]!.kick).toBe(false);
  });

  it('bots throw kicks as well as punches', () => {
    universe.reset();
    const sim = createSimWorld({ level: skyhold, seed: 5, settings: { playerCount: 0, bots: 2, items: 'off' } });
    attachBots(sim.ecs, [0, 1]);
    let kicks = 0;
    let punches = 0;
    for (let t = 0; t < 60 * 40 && kicks === 0; t++) {
      for (const ev of sim.step()) {
        if (ev.type === 'punch') {
          if (ev.kick) kicks += 1;
          else punches += 1;
        }
      }
    }
    expect(kicks).toBeGreaterThan(0);
    expect(punches).toBeGreaterThan(0);
  }, 30_000);
});

describe('launch mode strikes', () => {
  it('kicks scale with percent like everything else', () => {
    // Entity handles are recycled when the next sim is made, so read the first world before that.
    const fresh = faceOff(0.8, { mode: 'launch' });
    const v0 = strike(fresh.sim, 'kick').launched.x;
    const stun0 = fresh.b.get(Combat)?.stun ?? 0;
    const x0 = fresh.b.get(Transform)?.x ?? 0;
    const worn = faceOff(0.8, { mode: 'launch' });
    worn.b.set(Health, { percent: 120 });
    const v1 = strike(worn.sim, 'kick').launched.x;
    expect(v1).toBeGreaterThan(v0 * 1.5);
    expect(worn.b.get(Combat)?.stun ?? 0).toBeGreaterThan(stun0);
    expect(worn.b.get(Transform)?.x ?? 0).toBeGreaterThan(x0);
  });
});
