import { describe, expect, it } from 'vitest';
import { consumeLatch, createPadEdgeTracker, emptyLatch, isPadKey, padIndexOf, padKey, padLabel, radialDeadzone, readPad } from '../src/input/gamepad';

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

describe('pad menu edges', () => {
  it('keys seats by browser slot, not the (shared) id string, and shortens the label', () => {
    const pad = fakePad({ id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)' });
    expect(padKey(pad)).toBe('pad:0');
    expect(padKey({ index: 2 })).toBe('pad:2');
    expect(padIndexOf('pad:3')).toBe(3);
    expect(padIndexOf('keyboard')).toBe(-1);
    expect(isPadKey('pad:1')).toBe(true);
    expect(isPadKey('keyboard')).toBe(false);
    expect(padLabel(pad)).toBe('DualSense Wireless Controller');
    expect(padLabel({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' })).toBe('Xbox 360 Controller');
  });

  it('fires A / B / Start / Select once per press, however long they are held', () => {
    const t = createPadEdgeTracker();
    const held = fakePad({ buttons: [true, true, false, false, false, false, false, false, true, true] });
    const first = t.update(held, 0);
    expect(first).toMatchObject({ a: true, b: true, start: true, select: true });
    const again = t.update(held, 16);
    expect(again).toMatchObject({ a: false, b: false, start: false, select: false });
    t.update(fakePad({ buttons: [] }), 32);
    expect(t.update(held, 48).a).toBe(true);
  });

  it('honours a remapped pause button for Start', () => {
    const t = createPadEdgeTracker();
    expect(t.update(fakePad({ buttons: [false, false, false, false, true] }), 0, 4).start).toBe(true);
  });

  it('turns the d-pad and left stick into a repeating digital direction with hysteresis', () => {
    const t = createPadEdgeTracker();
    const down = fakePad({ buttons: [false, false, false, false, false, false, false, false, false, false, false, false, false, true] });
    expect(t.update(down, 0).down).toBe(true);
    // Held: quiet until the repeat delay, then a tick every repeat interval.
    expect(t.update(down, 100).down).toBe(false);
    expect(t.update(down, 400).down).toBe(true);
    expect(t.update(down, 450).down).toBe(false);
    expect(t.update(down, 520).down).toBe(true);
    // Release, then the stick: a nudge under the threshold is nothing, a push is a move, and
    // easing back to the hysteresis band does not re-trigger or flip.
    t.update(fakePad({ buttons: [] }), 600);
    expect(t.update(fakePad({ axes: [0.4, 0, 0, 0] }), 620)).toMatchObject({ right: false, left: false });
    expect(t.update(fakePad({ axes: [0.9, 0, 0, 0] }), 640).right).toBe(true);
    expect(t.update(fakePad({ axes: [0.5, 0, 0, 0] }), 660).right).toBe(false);
    expect(t.update(fakePad({ axes: [0.2, 0, 0, 0] }), 680).right).toBe(false);
    expect(t.update(fakePad({ axes: [0.9, 0, 0, 0] }), 700).right).toBe(true);
    // Up on the stick is negative Y.
    t.update(fakePad({ buttons: [] }), 720);
    expect(t.update(fakePad({ axes: [0, -0.9, 0, 0] }), 740).up).toBe(true);
  });
});
