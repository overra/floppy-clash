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
  pauseRisingEdge,
  routeSeatInputs,
  samplePrimaryLocal,
  seatIndexForPad,
  seedHeldFromDown,
} from '../src/input/seats';
import {
  canStartMatch,
  claimConnectedPadIds,
  clearJoinSeats,
  createMenuState,
  cycleSeatColor,
  hpSelectOptions,
  rememberTakenSeats,
  readMatchSettingsFromCard,
  screenAfterLeavingSettings,
  shouldOfferRemapOnScreen,
  syncMatchSettingsFromDom,
  takeOrReadySeat,
  takeSeat,
} from '../src/ui/menus';
import { joinStartIndex } from '../src/input/remap';
import { Health, Player } from '../src/sim/traits';
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

  it('remembers pad slot and color after join seats are cleared (PLAN 4.12)', () => {
    const menus = createMenuState();
    takeSeat(menus.seats, 'pad-blue', menus.padMemory);
    cycleSeatColor(menus.seats[0]!, 1, menus.padMemory);
    expect(menus.seats[0]?.color).toBe(1);
    rememberTakenSeats(menus.seats, menus.padMemory);
    clearJoinSeats(menus.seats);
    menus.seats[0] = { taken: true, ready: true, color: 0, padId: 'keyboard', name: 'You' };
    rememberTakenSeats(menus.seats, menus.padMemory);
    clearJoinSeats(menus.seats);
    expect(menus.seats[0]?.taken).toBe(false);
    const again = takeSeat(menus.seats, 'pad-blue', menus.padMemory);
    expect(again?.color).toBe(1);
    expect(menus.seats.indexOf(again!)).toBe(0);
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

  it('each HP preset is the spawned player Health, not a label-only constant', () => {
    for (const maxHp of HP_PRESETS) {
      const sim = makeSim({ seed: 50 + maxHp, settings: { playerCount: 2, maxHp } });
      expect(playerOf(sim, 0).get(Health)?.hp, String(maxHp)).toBe(maxHp);
      expect(playerOf(sim, 0).get(Health)?.maxHp, String(maxHp)).toBe(maxHp);
      expect(playerOf(sim, 1).get(Health)?.hp, String(maxHp)).toBe(maxHp);
    }
    const markup = hpSelectOptions(25);
    for (const hp of HP_PRESETS) expect(markup).toContain(`value="${hp}"`);
    expect(markup).toContain('selected');
  });

  it('join Start uses the remapped pause button (PLAN 4.12)', () => {
    expect(joinStartIndex()).toBe(9);
    expect(joinStartIndex({ jump: 0, attack: 7, block: 6, throw: 3, pause: 8 })).toBe(8);
  });

  it('solo vs bots: a pad claims the prefilled keyboard seat (PLAN M9)', () => {
    const menus = createMenuState();
    menus.seats[0] = { taken: true, ready: true, color: 0, padId: 'keyboard', name: 'You' };
    const pad = takeSeat(menus.seats, 'pad-solo', menus.padMemory, { replaceKeyboard: true });
    expect(pad?.padId).toBe('pad-solo');
    expect(menus.seats[0]?.padId).toBe('pad-solo');
    expect(menus.seats[0]?.ready).toBe(true);
    expect(menus.seats[1]?.taken).toBe(false);
    takeOrReadySeat(menus.seats, 'pad-solo', menus.padMemory, { replaceKeyboard: true });
    expect(menus.seats[0]?.ready).toBe(true);
  });

  it('solo vs bots: a second pad does not become leftover P2', () => {
    const menus = createMenuState();
    menus.seats[0] = { taken: true, ready: true, color: 0, padId: 'keyboard', name: 'You' };
    takeSeat(menus.seats, 'pad-solo', menus.padMemory, { replaceKeyboard: true });
    const extra = takeSeat(menus.seats, 'pad-p2', menus.padMemory, { replaceKeyboard: true });
    expect(extra).toBeUndefined();
    expect(menus.seats[0]?.padId).toBe('pad-solo');
    expect(menus.seats[1]?.taken).toBe(false);
  });

  it('solo vs bots: claiming a not-ready keyboard stays not-ready', () => {
    const menus = createMenuState();
    menus.seats[0] = { taken: true, ready: false, color: 0, padId: 'keyboard', name: 'You' };
    takeSeat(menus.seats, 'pad-solo', menus.padMemory, { replaceKeyboard: true });
    expect(menus.seats[0]?.padId).toBe('pad-solo');
    expect(menus.seats[0]?.ready).toBe(false);
  });

  it('claimConnectedPadIds occupies already-connected pads', () => {
    const menus = createMenuState();
    menus.seats[0] = { taken: true, ready: true, color: 0, padId: 'keyboard', name: 'You' };
    const claimed = claimConnectedPadIds(menus.seats, ['e2e-already'], menus.padMemory, {
      replaceKeyboard: true,
    });
    expect(claimed[0]?.padId).toBe('e2e-already');
    expect(menus.seats[0]?.padId).toBe('e2e-already');
    expect(menus.seats[0]?.ready).toBe(true);
    expect(menus.seats[1]?.taken).toBe(false);
  });

  it('local play: already-connected pads occupy empty seats not-ready', () => {
    const menus = createMenuState();
    const claimed = claimConnectedPadIds(menus.seats, ['e2e-local-already'], menus.padMemory);
    expect(claimed[0]?.padId).toBe('e2e-local-already');
    expect(menus.seats[0]?.taken).toBe(true);
    expect(menus.seats[0]?.ready).toBe(false);
    expect(menus.seats[1]?.taken).toBe(false);
  });

  it('a held Start after play begins is not a pause rising edge (PLAN 4.12)', () => {
    const held = [false, false, false, false];
    seedHeldFromDown(held, [true, false, false, false]);
    expect(held[0]).toBe(true);
    expect(pauseRisingEdge(held[0]!, true)).toBe(false);
    expect(pauseRisingEdge(held[0]!, false)).toBe(false);
    expect(pauseRisingEdge(false, true)).toBe(true);
  });

  it('local play does not replace a keyboard P1 with a second pad', () => {
    const menus = createMenuState();
    takeSeat(menus.seats, 'keyboard');
    takeSeat(menus.seats, 'pad-p2');
    expect(menus.seats[0]?.padId).toBe('keyboard');
    expect(menus.seats[1]?.padId).toBe('pad-p2');
  });

  it('Start/Options pause is a rising edge (hold does not re-fire)', () => {
    expect(pauseRisingEdge(false, true)).toBe(true);
    expect(pauseRisingEdge(true, true)).toBe(false);
    expect(pauseRisingEdge(true, false)).toBe(false);
    expect(pauseRisingEdge(false, false)).toBe(false);
  });

  it('offers remap on menu/join/lobby, not mid-round play/pause/disconnect', () => {
    expect(shouldOfferRemapOnScreen('menu')).toBe(true);
    expect(shouldOfferRemapOnScreen('join')).toBe(true);
    expect(shouldOfferRemapOnScreen('lobby')).toBe(true);
    expect(shouldOfferRemapOnScreen('settings')).toBe(true);
    expect(shouldOfferRemapOnScreen('play')).toBe(false);
    expect(shouldOfferRemapOnScreen('pause')).toBe(false);
    expect(shouldOfferRemapOnScreen('disconnect')).toBe(false);
  });

  it('Save/Back after a remap offer returns to join, not the main menu', () => {
    expect(screenAfterLeavingSettings('join')).toBe('join');
    expect(screenAfterLeavingSettings('lobby')).toBe('lobby');
    expect(screenAfterLeavingSettings('menu')).toBe('menu');
    expect(screenAfterLeavingSettings('')).toBe('menu');
    expect(screenAfterLeavingSettings('settings')).toBe('menu');
  });

  it('reads HP / first-to from the live form so Start is not stale', () => {
    const menus = createMenuState();
    menus.maxHp = 100;
    menus.firstTo = 0;
    const settings = { maxHp: 100, firstTo: 0 };
    const root = {
      querySelector: (sel: string) => {
        if (sel === '#hp') return { value: '25' };
        if (sel === '#ft') return { value: '3' };
        return null;
      },
    } as unknown as ParentNode;
    readMatchSettingsFromCard(root, menus);
    expect(menus.maxHp).toBe(25);
    expect(menus.firstTo).toBe(3);
    syncMatchSettingsFromDom(root, menus, settings);
    expect(settings.maxHp).toBe(25);
    expect(settings.firstTo).toBe(3);
  });
});
