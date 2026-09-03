import { describe, expect, it } from 'vitest';
import { consumeLatch, emptyLatch, radialDeadzone, readPad } from '../src/input/gamepad';
import { shouldOfferRemap } from '../src/input/remap';
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

  it('honours a custom remap', () => {
    const latch = emptyLatch();
    const pad = fakePad({
      id: 'custom',
      buttons: [false, false, true],
    });
    const input = readPad(pad, latch, { x: 1, y: 0 }, { jump: 2, attack: 7, block: 6, throw: 3, pause: 9 });
    expect(input.jump).toBe(true);
  });
});
