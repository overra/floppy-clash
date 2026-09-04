import { describe, expect, it } from 'vitest';
import { poseToPrimitives } from '../src/render/figure';
import {
  coverage,
  opSmoothUnion,
  primitiveSdf,
  PRIM_DISK,
  sdCapsule,
  sdDisk,
} from '../src/render/sdf/primitives';
import { evalCoverageGpu, evalPrimitiveSdfGpu, evalSmoothUnionGpu } from '../src/render/gpu/shaders';
import { DEFAULT_GLOW, Layer, group } from '../src/render/frame';
import { packGroups } from '../src/render/gpu/pack';

describe('sdf primitives', () => {
  it('disk is negative inside', () => {
    expect(sdDisk({ x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toBeCloseTo(-1);
    expect(sdDisk({ x: 2, y: 0 }, { x: 0, y: 0 }, 1)).toBeCloseTo(1);
  });

  it('capsule matches a stadium', () => {
    expect(sdCapsule({ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 1, y: 0 }, 0.5)).toBeCloseTo(-0.5);
  });

  it('smooth union is below min', () => {
    const u = opSmoothUnion(-0.2, -0.1, 0.3);
    expect(u).toBeLessThan(Math.min(-0.2, -0.1));
  });

  it('coverage maps distance to alpha', () => {
    expect(coverage(-2, 1)).toBe(1);
    expect(coverage(2, 1)).toBe(0);
  });

  it('primitiveSdf dispatches kinds', () => {
    expect(primitiveSdf({ kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 1 }, { x: 0, y: 0 })).toBeLessThan(0);
  });
});

describe('glow groups', () => {
  const dot = { kind: PRIM_DISK, ax: 5, ay: 5, bx: 5, by: 5, r: 0.1 };

  it('grow their quad to hold the whole halo, however small the requested pad is', () => {
    const g = group([dot], '#fff', Layer.Particles, { style: 'flat', fx: 'glow', pad: 0.15, glow: 0.6 });
    expect(g.glow).toBe(0.6);
    expect(g.minX).toBeLessThanOrEqual(5 - 0.1 - 0.6);
    expect(g.maxY).toBeGreaterThanOrEqual(5 + 0.1 + 0.6);
    const plain = group([dot], '#fff', Layer.Particles, { style: 'flat', pad: 0.15 });
    expect(plain.glow).toBeUndefined();
    expect(plain.minX).toBeCloseTo(5 - 0.25);
    const dflt = group([dot], '#fff', Layer.Particles, { fx: 'glow' });
    expect(dflt.glow).toBe(DEFAULT_GLOW);
    expect(dflt.minX).toBeLessThanOrEqual(5 - 0.1 - DEFAULT_GLOW);
  });

  it('pack the halo reach for the shader', () => {
    const g = group([dot], '#fff', Layer.Particles, { fx: 'lava', glow: 0.9 });
    const { groupBytes } = packGroups([g]);
    expect(new DataView(groupBytes).getFloat32(56, true)).toBeCloseTo(0.9);
    const { groupBytes: plain } = packGroups([group([dot], '#fff', Layer.Particles)]);
    expect(new DataView(plain).getFloat32(56, true)).toBe(0);
  });
});

describe('TypeGPU use-gpu fns on CPU', () => {
  it('calls DualFn coverage / sdf / smooth-union', () => {
    expect(evalCoverageGpu(-1)).toBeGreaterThan(0.5);
    const inside = evalPrimitiveSdfGpu({ kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 1 }, 0, 0);
    expect(inside).toBeLessThan(0);
    const u = evalSmoothUnionGpu(-0.2, -0.1, 0.3);
    expect(Number.isFinite(u)).toBe(true);
  });
});

describe('figure pose', () => {
  it('emits a head plus limb capsules', () => {
    const prims = poseToPrimitives({
      x: 0,
      y: 0,
      facing: 1,
      ducking: false,
      grounded: true,
      wallSliding: false,
      vx: 4,
      vy: 0,
      aimX: 1,
      aimY: 0,
      punching: true,
      blocking: false,
      dead: false,
      phase: 0.2,
    });
    expect(prims.length).toBeGreaterThanOrEqual(8);
    expect(prims.length).toBeLessThanOrEqual(16);
    expect(prims.some((p) => p.kind === PRIM_DISK)).toBe(true);
  });

  it('wall-slide pose offsets the hip opposite facing', () => {
    const base = poseToPrimitives({
      x: 0,
      y: 0,
      facing: 1,
      ducking: false,
      grounded: false,
      wallSliding: false,
      vx: 0,
      vy: -2,
      aimX: 1,
      aimY: 0,
      punching: false,
      blocking: false,
      dead: false,
      phase: 0,
    });
    const slide = poseToPrimitives({
      x: 0,
      y: 0,
      facing: 1,
      ducking: false,
      grounded: false,
      wallSliding: true,
      vx: 0,
      vy: -2,
      aimX: 1,
      aimY: 0,
      punching: false,
      blocking: false,
      dead: false,
      phase: 0,
    });
    const hipBase = base[1];
    const hipSlide = slide[1];
    expect(hipSlide?.bx).toBeLessThan(hipBase?.bx ?? 0);
  });
});
