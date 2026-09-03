import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRadianceCascades, getCascadeDim } from '@typegpu/radiance-cascades';
import { createJumpFlood } from '@typegpu/sdf';
import { emptyFrame } from '../src/render/frame';
import {
  boxSdf,
  cascadeSdfFromJfa,
  cascadeSceneSdf,
  classifyLiveSolidAt,
  emitterContribution,
  jumpFloodSdf,
  lightingCameraFromFrame,
  lightingEnabled,
  lightingViewBounds,
  lightingWorldFromUv,
  occludedEmitterContribution,
  resolveCascadeSdfWgsl,
  resolveClassifyWgsl,
  sampleJumpFlood,
  sceneSolidSdf,
  solidRectsFromFrame,
} from '../src/render/gpu/lighting';

describe('2D lighting', () => {
  it('respects the GPU budget toggle', () => {
    expect(lightingEnabled({ enabled: true, budgetMs: 4 }, 2)).toBe(true);
    expect(lightingEnabled({ enabled: true, budgetMs: 4 }, 4)).toBe(false);
    expect(lightingEnabled({ enabled: false, budgetMs: 4 }, 1)).toBe(false);
  });

  it('accumulates emitter falloff on the CPU', () => {
    const c = emitterContribution(
      [{ x: 0, y: 0, radius: 2, r: 1, g: 0.5, b: 0.1, intensity: 1 }],
      0,
      0,
    );
    expect(c.r).toBeGreaterThan(0.5);
    const far = emitterContribution(
      [{ x: 0, y: 0, radius: 2, r: 1, g: 0.5, b: 0.1, intensity: 1 }],
      8,
      0,
    );
    expect(far.r).toBe(0);
  });

  it('exposes radiance-cascades and jump-flood factories', () => {
    expect(typeof createRadianceCascades).toBe('function');
    expect(typeof createJumpFlood).toBe('function');
    const dim = getCascadeDim(256, 144);
    expect(dim.length).toBeGreaterThanOrEqual(2);
  });

  it('Jump Flood of solids occludes lava/muzzle/explosion emitters (PLAN 4.11)', () => {
    const bounds = { x: 0, y: 0, w: 16, h: 8 };
    const wall = { minX: 7.2, minY: 0, maxX: 8.8, maxY: 8 };
    const field = jumpFloodSdf([wall], bounds, 64, 32);
    expect(sampleJumpFlood(field, 8, 4)).toBeLessThan(0);
    expect(sampleJumpFlood(field, 2, 4)).toBeGreaterThan(0.5);
    const lava = [{ x: 2, y: 4, radius: 12, r: 1, g: 0.4, b: 0.1, intensity: 1 }];
    const lit = occludedEmitterContribution(field, lava, 3, 4);
    const shadow = occludedEmitterContribution(field, lava, 13, 4);
    expect(lit.r).toBeGreaterThan(0.2);
    expect(shadow.r).toBeLessThan(lit.r * 0.15);
    const frame = emptyFrame();
    frame.groups.push({
      minX: 1,
      minY: 1,
      maxX: 3,
      maxY: 2,
      color: '#333',
      blend: 'union',
      smoothK: 0,
      layer: 1,
      primitives: [],
    });
    frame.groups.push({
      minX: 4,
      minY: 4,
      maxX: 5,
      maxY: 5,
      color: '#f80',
      blend: 'union',
      smoothK: 0,
      layer: 2,
      primitives: [],
    });
    expect(solidRectsFromFrame(frame)).toEqual([{ minX: 1, minY: 1, maxX: 3, maxY: 2 }]);
  });

  it('JFA classify follows live solids, not a fixed center slab', () => {
    const cam = { x: 16, y: 9, zoom: 40, viewX: 1280, viewY: 720 };
    const leftWall = { minX: 0, minY: 0, maxX: 8, maxY: 18 };
    const rightWall = { minX: 24, minY: 0, maxX: 32, maxY: 18 };
    // UV x=0.15 is world x ≈ 16 + (0.15-0.5)*32 = 4.8 (inside left, outside right).
    expect(classifyLiveSolidAt([leftWall], cam, 38, 72, 256, 144)).toBe(true);
    expect(classifyLiveSolidAt([rightWall], cam, 38, 72, 256, 144)).toBe(false);
    // UV x=0.85 is world x ≈ 27.2 (outside left, inside right).
    expect(classifyLiveSolidAt([leftWall], cam, 217, 72, 256, 144)).toBe(false);
    expect(classifyLiveSolidAt([rightWall], cam, 217, 72, 256, 144)).toBe(true);
    // Empty scene is never inside — a slab would still mark the middle third.
    expect(classifyLiveSolidAt([], cam, 128, 72, 256, 144)).toBe(false);
    const mid = lightingWorldFromUv(0.5, 0.5, cam);
    expect(mid.x).toBeCloseTo(16, 5);
    expect(mid.y).toBeCloseTo(9, 5);
  });

  it('cascade SDF is the live solid field, not a disk at uv 0.5', () => {
    const cam = { x: 16, y: 9, zoom: 40, viewX: 1280, viewY: 720 };
    const wall = { minX: 2, minY: 0, maxX: 6, maxY: 18 };
    const leftUv = lightingWorldFromUv(0.15, 0.5, cam);
    expect(leftUv.x).toBeGreaterThan(2);
    expect(leftUv.x).toBeLessThan(6);
    const onWall = cascadeSceneSdf([wall], [], 0.15, 0.5, cam);
    const center = cascadeSceneSdf([wall], [], 0.5, 0.5, cam);
    const emptyCenter = cascadeSceneSdf([], [], 0.5, 0.5, cam);
    expect(onWall).toBeLessThan(0);
    expect(center).toBeGreaterThan(0);
    expect(emptyCenter).toBeGreaterThan(center * 0.5);
    expect(boxSdf(4, 9, wall)).toBeLessThan(0);
    expect(sceneSolidSdf([wall], 16, 9)).toBeGreaterThan(4);
    const frame = emptyFrame();
    frame.camera = { ...frame.camera, x: 16, y: 9, zoom: 40 };
    expect(lightingCameraFromFrame(frame, 1280, 720).viewX).toBe(1280);
  });

  it('resolves live-solid classify and JFA-sampling cascade DualFns (no slab / disk)', () => {
    const classify = resolveClassifyWgsl();
    expect(classify).toMatch(/classifyLiveSolidGpu|fn classifyLiveSolidGpu/);
    expect(classify).not.toMatch(/size\.x\s*\/\s*4/);
    expect(classify).not.toMatch(/size\.x \* 3/);
    const sdf = resolveCascadeSdfWgsl();
    expect(sdf).toMatch(/cascadeJfaSdfGpu|fn cascadeJfaSdfGpu/);
    expect(sdf).toMatch(/textureLoad/);
    expect(sdf).toMatch(/jfaSdf/);
    // Old stand-in was `hypot(uv - 0.5) - 0.15` or a live AABB walk in sdf:.
    expect(sdf).not.toMatch(/0\.15/);
    expect(sdf).not.toMatch(/cascadeSceneSdfGpu/);
  });

  it('cascade SDF samples the Jump Flood field, not a disk at uv 0.5', () => {
    const cam = { x: 16, y: 9, zoom: 40, viewX: 1280, viewY: 720 };
    const wall = { minX: 2, minY: 0, maxX: 6, maxY: 18 };
    const field = jumpFloodSdf([wall], lightingViewBounds(cam), 64, 36);
    const onWall = cascadeSdfFromJfa(field, [], 0.15, 0.5, cam);
    const center = cascadeSdfFromJfa(field, [], 0.5, 0.5, cam);
    const empty = jumpFloodSdf([], lightingViewBounds(cam), 32, 18);
    const emptyCenter = cascadeSdfFromJfa(empty, [], 0.5, 0.5, cam);
    expect(onWall).toBeLessThan(0);
    expect(center).toBeGreaterThan(0);
    expect(emptyCenter).toBeGreaterThan(center * 0.5);
    const aabb = cascadeSceneSdf([wall], [], 0.15, 0.5, cam);
    expect(Math.sign(onWall)).toBe(Math.sign(aabb));
  });

  it('does not run cascades unless this frame’s JFA texture exists', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/render/gpu/lighting.ts'), 'utf8');
    expect(src).toContain('cascadeJfaSdfGpu');
    expect(src).toContain('textureLoad');
    expect(src).toContain('jfaReady');
    expect(src).toMatch(/if \(jfaReady && cascades\)/);
    expect(src).toMatch(/let cascades = root && jfa && jfaBind \? tryCreateCascades/);
    expect(src).not.toMatch(/return cascadeSceneSdfGpu\(uv\)/);
  });
});
