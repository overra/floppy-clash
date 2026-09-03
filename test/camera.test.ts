import { describe, expect, it } from 'vitest';
import { createCamera, updateCamera } from '../src/render/camera';

const bounds = { x: 0, y: 0, w: 32, h: 18 };

function settle(
  cam: ReturnType<typeof createCamera>,
  targets: { x: number; y: number }[],
  viewW = 1280,
  viewH = 720,
): ReturnType<typeof createCamera> {
  for (let i = 0; i < 80; i++) updateCamera(cam, targets, bounds, viewW, viewH);
  return cam;
}

describe('PLAN 4.11 camera', () => {
  it('never zooms out past the whole-arena view', () => {
    const ppmArena = Math.min(1280 / bounds.w, 720 / bounds.h);
    const clustered = settle(createCamera(bounds), [
      { x: 16, y: 9 },
      { x: 16.4, y: 9.1 },
    ]);
    expect(clustered.zoom).toBeGreaterThanOrEqual(ppmArena * 0.99);

    const spread = settle(createCamera(bounds), [
      { x: -4, y: -2 },
      { x: 40, y: 22 },
    ]);
    expect(spread.zoom).toBeGreaterThanOrEqual(ppmArena * 0.99);
  });

  it('clamps the view center to level bounds', () => {
    const cam = createCamera(bounds);
    cam.x = -20;
    cam.y = 40;
    settle(cam, [{ x: 1, y: 1 }]);
    expect(cam.x).toBeGreaterThanOrEqual(bounds.x);
    expect(cam.x).toBeLessThanOrEqual(bounds.x + bounds.w);
    expect(cam.y).toBeGreaterThanOrEqual(bounds.y);
    expect(cam.y).toBeLessThanOrEqual(bounds.y + bounds.h);
  });
});
