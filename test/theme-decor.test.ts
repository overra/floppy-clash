import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { groupBounds } from '../src/render/frame';
import { PRIM_BEZIER, PRIM_ROUNDED_BOX } from '../src/render/sdf/primitives';
import { lerpHex, themePassGroups } from '../src/render/themeDecor';
import { themeOf } from '../src/sim/level/themes';
import { makeSim } from './helpers';

describe('PLAN §4.11 theme pass', () => {
  it('emits gradient bands and parallax decorations including beziers', () => {
    const theme = themeOf('woods');
    const cam = createCamera({ x: 0, y: 0, w: 32, h: 18 });
    cam.x = 12;
    cam.y = 8;
    cam.zoom = 32;
    const groups = themePassGroups(theme, { x: 0, y: 0, w: 32, h: 18 }, cam, 1280, 720);
    expect(groups.every((g) => g.layer === 0)).toBe(true);
    expect(
      groups.filter((g) => g.primitives.some((p) => p.kind === PRIM_ROUNDED_BOX)).length,
    ).toBeGreaterThanOrEqual(4);
    expect(groups.some((g) => g.primitives.some((p) => p.kind === PRIM_BEZIER))).toBe(true);
    const colors = new Set(groups.map((g) => g.color));
    expect(colors.size).toBeGreaterThan(2);
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    const viewHalfW = 1280 / cam.zoom / 2;
    const viewHalfH = 720 / cam.zoom / 2;
    const bands = groups.filter(
      (g) => g.primitives.length === 1 && g.primitives[0]?.kind === PRIM_ROUNDED_BOX,
    );
    expect(bands.length).toBeGreaterThanOrEqual(5);
    const minX = Math.min(...bands.map((g) => g.minX));
    const maxX = Math.max(...bands.map((g) => g.maxX));
    const minY = Math.min(...bands.map((g) => g.minY));
    const maxY = Math.max(...bands.map((g) => g.maxY));
    expect(minX).toBeLessThan(cam.x - viewHalfW);
    expect(maxX).toBeGreaterThan(cam.x + viewHalfW);
    expect(minY).toBeLessThan(cam.y - viewHalfH);
    expect(maxY).toBeGreaterThan(cam.y + viewHalfH);
  });

  it('rounded-box bounds use half-extents, not bx/by as points', () => {
    const b = groupBounds([{ kind: PRIM_ROUNDED_BOX, ax: 16, ay: 8, bx: 2, by: 1, r: 0.1 }], 0);
    expect(b.minX).toBeCloseTo(14);
    expect(b.maxX).toBeCloseTo(18);
    expect(b.minY).toBeCloseTo(7);
    expect(b.maxY).toBeCloseTo(9);
  });

  it('buildFrame includes the theme pass on every match frame', () => {
    const sim = makeSim({ level: woodsClearing, seed: 2, settings: { playerCount: 1 } });
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    expect(frame.groups.some((g) => g.layer === 0)).toBe(true);
    expect(frame.groups.some((g) => g.primitives.some((p) => p.kind === PRIM_BEZIER))).toBe(true);
  });
});
