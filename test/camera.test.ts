import { describe, expect, it } from 'vitest';
import { createCamera, updateCamera, warpWorld, worldToScreen } from '../src/render/camera';
import { evalWarpPostUvGpu, evalWarpWorldGpu } from '../src/render/gpu/shaders';

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
    expect(clustered.zoom).toBeGreaterThan(ppmArena * 1.2);

    const spread = settle(createCamera(bounds), [
      { x: -4, y: -2 },
      { x: 40, y: 22 },
    ]);
    expect(spread.zoom).toBeGreaterThanOrEqual(ppmArena * 0.99);
    expect(spread.zoom).toBeLessThan(clustered.zoom);
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

  it('warps world samples toward a black-hole attractor', () => {
    const hole = { x: 10, y: 4, r: 4 };
    const near = warpWorld(11, 4, hole);
    expect(near.x).toBeLessThan(11);
    const far = warpWorld(20, 4, hole);
    expect(Math.abs(far.x - 20)).toBeLessThan(0.05);
    expect(warpWorld(11, 4).x).toBe(11);
    const screen = worldToScreen(
      { x: 10, y: 4, zoom: 20, shakeX: 0, shakeY: 0, shake: 0 },
      11,
      4,
      200,
      100,
      hole,
    );
    const unwarped = worldToScreen(
      { x: 10, y: 4, zoom: 20, shakeX: 0, shakeY: 0, shake: 0 },
      11,
      4,
      200,
      100,
    );
    expect(screen.x).toBeLessThan(unwarped.x);
  });

  it('TypeGPU DualFns warp toward the hole (no silent CPU pass)', () => {
    const hole = { x: 10, y: 4, z: 4, w: 0.35 };
    const world = evalWarpWorldGpu(11, 4, hole);
    expect(world.via).toBe('dualfn');
    expect(world.x).toBeLessThan(11);
    const uv = evalWarpPostUvGpu(0.6, 0.5, { x: 80, y: 50, z: 40, w: 0.35 }, { x: 200, y: 100 });
    expect(uv.via).toBe('dualfn');
    expect(uv.x).not.toBeCloseTo(0.6, 4);
  });
});
