import { describe, expect, it } from 'vitest';
import { radialDeadzone } from '../src/input/gamepad';
import { rising } from '../src/sim/input';
import { Aim, Controller } from '../src/sim/traits';
import { canStartMatch, createMenuState, cycleSeatColor, takeOrReadySeat, takeSeat } from '../src/ui/menus';
import { hold, makeSim, playerOf } from './helpers';

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
});
