import { describe, expect, it } from 'vitest';
import { consumeLatch, emptyLatch, radialDeadzone, readPad } from '../src/input/gamepad';

function fakePad(partial: { axes?: number[]; buttons?: boolean[] }): Gamepad {
  const buttons = (partial.buttons ?? []).map((pressed) => ({
    pressed,
    touched: pressed,
    value: pressed ? 1 : 0,
  })) as GamepadButton[];
  while (buttons.length < 17) buttons.push({ pressed: false, touched: false, value: 0 } as GamepadButton);
  const axes = partial.axes ?? [0, 0, 0, 0];
  return {
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    index: 0,
    connected: true,
    mapping: 'standard',
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
});
