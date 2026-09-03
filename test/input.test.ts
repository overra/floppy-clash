import { describe, expect, it } from 'vitest';
import { radialDeadzone } from '../src/input/gamepad';
import { rising } from '../src/sim/input';
import { Aim, Controller } from '../src/sim/traits';
import {
  canResumePause,
  HP_PRESETS,
  humanSeatAssignments,
  keyboardSeatIndex,
  matchPlayerCount,
  routeSeatInputs,
  samplePrimaryLocal,
  seatIndexForPad,
} from '../src/input/seats';
import { canStartMatch, createMenuState, cycleSeatColor, takeOrReadySeat, takeSeat } from '../src/ui/menus';
import { Player } from '../src/sim/traits';
import { hold, makeSim, playerOf } from './helpers';
import { EMPTY_INPUT, type PlayerInput } from '../src/sim/input';

describe('input', () => {
  it('detects rising edges', () => {
    expect(rising(false, true)).toBe(true);
    expect(rising(true, true)).toBe(false);
    expect(rising(true, false)).toBe(false);
  });

  it('applies radial deadzone', () => {
    expect(radialDeadzone(0.1, 0, 0.2)).toEqual({ x: 0, y: 0 });
    const v = radialDeadzone(1, 0, 0.2);
    expect(v.x).toBeCloseTo(1);
  });

  it('holds aim then falls back to facing', () => {
    const sim = makeSim({ seed: 3, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.step([hold({ aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    expect(p.get(Aim)?.x).toBeGreaterThan(0.5);
    for (let i = 0; i < 12; i++) {
      sim.step([hold({ aimX: 0, aimY: 0 }), hold({}), hold({}), hold({})]);
    }
    expect(p.get(Aim)?.x).toBeGreaterThan(0.5);
    sim.step([hold({ aimX: 0, aimY: 0, moveX: -1 }), hold({}), hold({}), hold({})]);
    expect(p.get(Aim)?.x).toBeLessThan(0);
    expect(p.get(Controller)?.facing).toBe(-1);
  });
});

describe('join seats (PLAN 4.12)', () => {
  it('A joins, A again readies, Start needs a ready seat', () => {
    const menus = createMenuState();
    expect(canStartMatch(menus.seats)).toBe(false);
    takeSeat(menus.seats, 'pad-0');
    expect(menus.seats[0]?.taken).toBe(true);
    expect(menus.seats[0]?.ready).toBe(false);
    expect(canStartMatch(menus.seats)).toBe(false);
    takeOrReadySeat(menus.seats, 'pad-0');
    expect(menus.seats[0]?.ready).toBe(true);
    expect(canStartMatch(menus.seats)).toBe(true);
    takeOrReadySeat(menus.seats, 'keyboard');
    expect(menus.seats[1]?.taken).toBe(true);
    expect(menus.seats[1]?.ready).toBe(false);
  });

  it('left/right cycles seat color (PLAN 4.12)', () => {
    const menus = createMenuState();
    takeSeat(menus.seats, 'pad-0');
    const seat = menus.seats[0]!;
    expect(seat.color).toBe(0);
    cycleSeatColor(seat, 1);
    expect(seat.color).toBe(1);
    cycleSeatColor(seat, 1);
    cycleSeatColor(seat, 1);
    cycleSeatColor(seat, 1);
    expect(seat.color).toBe(0);
    cycleSeatColor(seat, -1);
    expect(seat.color).toBe(3);
  });

  it('routes pad id to the joined seat, not the Gamepad API index', () => {
    const seats = [
      { taken: true, padId: 'pad-high', color: 2, name: '', ready: true },
      { taken: true, padId: 'keyboard', color: 0, name: 'You', ready: true },
      { taken: false, padId: '', color: 0, name: '', ready: false },
      { taken: false, padId: '', color: 0, name: '', ready: false },
    ];
    expect(seatIndexForPad(seats, 'pad-high')).toBe(0);
    expect(keyboardSeatIndex(seats)).toBe(1);
    const padHigh = { id: 'pad-high' } as Gamepad;
    const padOther = { id: 'ghost' } as Gamepad;
    const padIn: PlayerInput = { ...EMPTY_INPUT, moveX: 1, jump: true };
    const keyIn: PlayerInput = { ...EMPTY_INPUT, moveX: -1, attack: true };
    const routed = routeSeatInputs({
      seats,
      pads: [null, null, padHigh, padOther],
      readPad: () => padIn,
      keyboard: keyIn,
    });
    expect(routed[0]?.moveX).toBe(1);
    expect(routed[0]?.jump).toBe(true);
    expect(routed[1]?.moveX).toBe(-1);
    expect(routed[1]?.attack).toBe(true);
    expect(routed[2]?.moveX).toBe(0);
  });

  it('samplePrimaryLocal prefers the first connected pad', () => {
    const pad = { id: 'only' } as Gamepad;
    const fromPad = samplePrimaryLocal({
      pads: [null, pad],
      padInput: () => ({ ...EMPTY_INPUT, throw: true }),
      keyboard: { ...EMPTY_INPUT, block: true },
    });
    expect(fromPad.throw).toBe(true);
    const fromKeys = samplePrimaryLocal({
      pads: [null, null],
      padInput: () => ({ ...EMPTY_INPUT, throw: true }),
      keyboard: { ...EMPTY_INPUT, block: true },
    });
    expect(fromKeys.block).toBe(true);
  });

  it('only the pausing pad or seat 1 (or UI) resumes', () => {
    const seats = [
      { taken: true, padId: 'pad-a', color: 0 },
      { taken: true, padId: 'pad-b', color: 1 },
    ];
    expect(canResumePause('pad-b', 'pad-b', seats)).toBe(true);
    expect(canResumePause('pad-a', 'pad-b', seats)).toBe(true);
    expect(canResumePause('pad-c', 'pad-b', seats)).toBe(false);
    expect(canResumePause('*', 'pad-b', seats)).toBe(true);
    expect(canResumePause('keyboard', 'keyboard', seats)).toBe(true);
    expect(canResumePause('keyboard', 'pad-b', seats)).toBe(false);
  });

  it('HP presets match PLAN Appendix A and seats spawn colors', () => {
    expect(HP_PRESETS).toEqual([1, 25, 50, 100, 200]);
    const menus = createMenuState();
    takeSeat(menus.seats, 'pad-z');
    menus.seats[0]!.color = 3;
    expect(humanSeatAssignments(menus.seats)[0]).toEqual({ slot: 0, color: 3, inputIndex: 0 });
    expect(matchPlayerCount(menus.seats, true)).toBe(4);
    const sim = makeSim({
      seed: 44,
      settings: { playerCount: 2, bots: 0 },
      seats: [
        { slot: 0, color: 3, inputIndex: 0 },
        { slot: 1, color: 1, inputIndex: 1 },
      ],
    });
    expect(playerOf(sim, 0).get(Player)?.color).toBe(3);
    expect(playerOf(sim, 1).get(Player)?.color).toBe(1);
    expect(playerOf(sim, 0).get(Player)?.inputIndex).toBe(0);
  });
});
