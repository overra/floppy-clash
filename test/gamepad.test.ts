import { describe, expect, it } from 'vitest';
import {
  buttonOn,
  consumeLatch,
  emptyLatch,
  radialDeadzone,
  readPad,
  smoothStick,
} from '../src/input/gamepad';
import { tuning } from '../src/sim/tuning';
import { playRumble, rumbleParams } from '../src/input/haptics';
import { DEFAULT_MAP, shouldOfferRemap } from '../src/input/remap';
import { claimDisconnectedSeat, createMenuState, markDisconnectedSeat } from '../src/ui/menus';

function fakePad(partial: { id?: string; mapping?: GamepadMappingType; axes?: number[]; buttons?: boolean[] }): Gamepad {
  const buttons = (partial.buttons ?? []).map((pressed) => ({
    pressed,
    touched: pressed,
    value: pressed ? 1 : 0,
  })) as GamepadButton[];
  while (buttons.length < 17) buttons.push({ pressed: false, touched: false, value: 0 } as GamepadButton);
  const axes = partial.axes ?? [0, 0, 0, 0];
  return {
    id: partial.id ?? 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    index: 0,
    connected: true,
    mapping: partial.mapping ?? 'standard',
    axes,
    buttons,
    timestamp: 1,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('gamepad mapping', () => {
  it('maps a recorded standard Xbox fixture to PlayerInput', () => {
    const latch = emptyLatch();
    const pad = fakePad({
      axes: [0.8, 0.1, 0.6, -0.2],
      buttons: [true, false, false, false, false, false, false, true],
    });
    const input = readPad(pad, latch, { x: 1, y: 0 });
    expect(input.moveX).toBeGreaterThan(0.5);
    expect(input.jump).toBe(true);
    expect(input.attack).toBe(true);
    consumeLatch(latch);
    const idle = readPad(fakePad({ axes: [0, 0, 0, 0], buttons: [] }), latch, { x: input.aimX, y: input.aimY });
    expect(idle.jump).toBe(false);
    expect(idle.attack).toBe(false);
  });

  it('deadzones a noisy stick and latches a tap', () => {
    expect(radialDeadzone(0.05, 0.05, 0.2)).toEqual({ x: 0, y: 0 });
    const latch = emptyLatch();
    readPad(fakePad({ buttons: [true] }), latch, { x: 1, y: 0 });
    expect(latch.jump).toBe(true);
  });

  it('maps DualSense / Switch Pro / Firefox-style fixtures', () => {
    const ds = readPad(
      fakePad({
        id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
        axes: [0.9, 0, 0, 0],
        buttons: [true, false, false, true, false, false, true, false],
      }),
      emptyLatch(),
      { x: 1, y: 0 },
    );
    expect(ds.moveX).toBeGreaterThan(0.5);
    expect(ds.jump).toBe(true);
    expect(ds.throw).toBe(true);
    expect(ds.block).toBe(true);

    const pro = readPad(
      fakePad({
        id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
        axes: [-0.8, 0.7, 0.1, 0],
        buttons: [false, false, false, false, false, false, false, true],
      }),
      emptyLatch(),
      { x: 1, y: 0 },
    );
    expect(pro.moveX).toBeLessThan(-0.4);
    expect(pro.down).toBe(true);
    expect(pro.attack).toBe(true);

    const ff = readPad(
      fakePad({
        id: '054c-0ce6-Wireless Controller',
        mapping: '' as GamepadMappingType,
        buttons: [false, false, false, false, false, false, false, false, false, true],
      }),
      emptyLatch(),
      { x: 1, y: 0 },
    );
    expect(ff.jump).toBe(false);
  });

  it('offers remap when the mapping is not standard', () => {
    expect(shouldOfferRemap('standard', 'Xbox', {})).toBe(false);
    expect(shouldOfferRemap('custom', '054c-0ce6-Wireless Controller', {})).toBe(true);
    expect(shouldOfferRemap('', '054c-0ce6-Wireless Controller', {})).toBe(true);
    expect(
      shouldOfferRemap('', '054c-0ce6-Wireless Controller', {
        '054c-0ce6-Wireless Controller': DEFAULT_MAP,
      }),
    ).toBe(false);
  });

  it('first new pad claims the disconnected seat', () => {
    const menus = createMenuState();
    menus.seats[0] = { taken: true, ready: true, color: 0, padId: 'pad-a', name: 'A' };
    menus.seats[1] = { taken: true, ready: true, color: 1, padId: 'pad-b', name: 'B' };
    expect(markDisconnectedSeat(menus.seats, 'pad-b')).toBe(1);
    const claim = claimDisconnectedSeat(menus.seats, 'pad-c', 1);
    expect(claim?.padId).toBe('pad-c');
    expect(menus.seats[0]?.padId).toBe('pad-a');
    expect(menus.seats[1]?.padId).toBe('pad-c');
  });

  it('X / Square throws and does not attack (PLAN 4.12)', () => {
    const input = readPad(
      fakePad({ buttons: [false, false, true] }),
      emptyLatch(),
      { x: 1, y: 0 },
    );
    expect(input.throw).toBe(true);
    expect(input.attack).toBe(false);
  });

  it('reads analog triggers at tuning.triggerThreshold', () => {
    const analog = (value: number): Gamepad => {
      const buttons = Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      }));
      buttons[6] = { pressed: false, touched: value >= 0.5, value };
      buttons[7] = { pressed: false, touched: value >= 0.5, value };
      return {
        id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons,
        timestamp: 1,
        hapticActuators: [],
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
    const down = readPad(analog(0.6), emptyLatch(), { x: 1, y: 0 });
    expect(down.attack).toBe(true);
    expect(down.block).toBe(true);
    expect(buttonOn({ pressed: false, touched: false, value: 0.49 } as GamepadButton)).toBe(false);
    expect(buttonOn({ pressed: false, touched: true, value: tuning.triggerThreshold } as GamepadButton)).toBe(
      true,
    );
    const up = readPad(analog(0.2), emptyLatch(), { x: 1, y: 0 });
    expect(up.attack).toBe(false);
    expect(up.block).toBe(false);
  });

  it('smooths stick motion when memory is provided', () => {
    expect(smoothStick(0, 1, 0.35)).toBeCloseTo(0.65);
    const mem = { moveX: 0, moveY: 0 };
    const a = readPad(fakePad({ axes: [1, 0, 0, 0] }), emptyLatch(), { x: 1, y: 0 }, DEFAULT_MAP, mem);
    expect(a.moveX).toBeGreaterThan(0.4);
    expect(a.moveX).toBeLessThan(1);
    expect(mem.moveX).toBe(a.moveX);
  });

  it('LB / L1 is a second jump binding (PLAN 4.12)', () => {
    const input = readPad(
      fakePad({ buttons: [false, false, false, false, true] }),
      emptyLatch(),
      { x: 1, y: 0 },
    );
    expect(input.jump).toBe(true);
    expect(input.attack).toBe(false);
  });

  it('d-pad is a digital move / duck fallback (PLAN 4.12)', () => {
    const buttons = Array.from({ length: 17 }, () => false);
    buttons[13] = true;
    buttons[15] = true;
    const input = readPad(fakePad({ buttons }), emptyLatch(), { x: 1, y: 0 });
    expect(input.moveX).toBe(1);
    expect(input.down).toBe(true);
  });

  it('honours a custom remap', () => {
    const latch = emptyLatch();
    const map = { jump: 2, attack: 7, block: 6, throw: 3, pause: 9 };
    const jumped = readPad(
      fakePad({ id: 'custom', buttons: [false, false, true] }),
      latch,
      { x: 1, y: 0 },
      map,
    );
    expect(jumped.jump).toBe(true);
    const unusedA = readPad(
      fakePad({ id: 'custom', buttons: [true, false, false] }),
      emptyLatch(),
      { x: 1, y: 0 },
      map,
    );
    expect(unusedA.jump).toBe(false);
  });

  it('playRumble calls playEffect when enabled and skips when disabled', () => {
    expect(rumbleParams('boom').duration).toBe(180);
    expect(rumbleParams('hit').duration).toBe(60);
    const pad = fakePad({});
    const calls: unknown[] = [];
    expect(playRumble([pad, null], 'hit', true, (p, params) => calls.push([p.id, params.duration]))).toBe(1);
    expect(calls).toEqual([[pad.id, 60]]);
    expect(playRumble([pad], 'boom', false, () => calls.push('nope'))).toBe(0);
    expect(calls).toHaveLength(1);
  });
});
