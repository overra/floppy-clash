import { describe, expect, it } from 'vitest';
import { radialDeadzone } from '../src/input/gamepad';
import { rising } from '../src/sim/input';
import { Aim, Controller, Player } from '../src/sim/traits';
import { assignColors, canStartMatch, clearSeats, createMenuState, cycleSeatColor, maxBots, takeOrReadySeat, takeSeat } from '../src/ui/menus';
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

  it('seats never share a color: picks skip taken palette entries and bots get the leftovers', () => {
    const menus = createMenuState();
    takeOrReadySeat(menus.seats, 'pad:0', 'Xbox');
    takeOrReadySeat(menus.seats, 'keyboard');
    expect(menus.seats[0]?.color).toBe(0);
    expect(menus.seats[1]?.color).toBe(1);
    // Cycling P1 right skips blue (P2's) and lands on red.
    cycleSeatColor(menus.seats[0]!, 1, menus.seats);
    expect(menus.seats[0]?.color).toBe(2);
    // Two humans + two bots: humans keep their picks, bots take the two unused colors.
    expect(assignColors(menus.seats, 4)).toEqual([2, 1, 0, 3]);
    expect(maxBots(menus.seats)).toBe(2);
    clearSeats(menus.seats);
    expect(menus.seats.every((s) => !s.taken && !s.ready && s.padId === '')).toBe(true);
    expect(maxBots(menus.seats)).toBe(4);
  });

  it('the sim paints fighters with the colors the join screen chose', () => {
    const sim = makeSim({ seed: 4, settings: { playerCount: 2, bots: 1, colors: [2, 0, 1] } });
    const colors = sim.players().map((p) => p.get(Player)?.color);
    expect(colors).toEqual([2, 0, 1]);
  });
});
