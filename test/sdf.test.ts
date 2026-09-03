import { describe, expect, it } from 'vitest';
import { poseToPrimitives } from '../src/render/figure';
import {
  coverage,
  opSmoothUnion,
  primitiveSdf,
  PRIM_BEZIER,
  PRIM_CAPSULE,
  PRIM_DISK,
  PRIM_PIE,
  PRIM_ROUNDED_BOX,
  PRIM_TRIANGLE,
  sdBezier,
  sdCapsule,
  sdDisk,
  sdPie,
  sdTriangle,
} from '../src/render/sdf/primitives';
import {
  evalCoverageGpu,
  evalPrimitiveSdfGpu,
  evalSmoothUnionGpu,
  evalWarpWorldGpu,
} from '../src/render/gpu/shaders';

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
    expect(
      primitiveSdf({ kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 1 }, { x: 0, y: 0 }),
    ).toBeLessThan(0);
  });
});

describe('TypeGPU use-gpu fns on CPU', () => {
  it('calls DualFn coverage / sdf / smooth-union', () => {
    expect(evalCoverageGpu(-1)).toBeGreaterThan(0.5);
    const inside = evalPrimitiveSdfGpu({ kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 1 }, 0, 0);
    expect(inside).toBeLessThan(0);
    const box = evalPrimitiveSdfGpu(
      { kind: PRIM_ROUNDED_BOX, ax: 0, ay: 0, bx: 1, by: 1, r: 0.1 },
      0,
      0,
    );
    expect(box).toBeLessThan(0);
    const u = evalSmoothUnionGpu(-0.2, -0.1, 0.3);
    expect(Number.isFinite(u)).toBe(true);
    expect(u).toBeLessThan(Math.min(-0.2, -0.1));
    const tri = { kind: PRIM_TRIANGLE, ax: 0, ay: 0, bx: 1, by: 0, r: 0.8 };
    expect(evalPrimitiveSdfGpu(tri, 0.4, 0.2)).toBeLessThan(0.5);
    expect(
      Number.isFinite(
        evalPrimitiveSdfGpu({ kind: PRIM_PIE, ax: 0, ay: 0, bx: 0.8, by: 0, r: 1 }, 0.2, 0.1),
      ),
    ).toBe(true);
    expect(
      sdTriangle({ x: 0.2, y: 0.1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.8, y: 0.8 }),
    ).toBeLessThan(0.5);
    expect(Number.isFinite(sdPie({ x: 0.2, y: 0.1 }, { x: 0, y: 0 }, 1, 0.8))).toBe(true);
    const curve = {
      kind: PRIM_BEZIER,
      ax: 0,
      ay: 0,
      bx: 2,
      by: 0,
      r: 0.1,
      cx: 1,
      cy: 0.8,
    };
    expect(
      sdBezier({ x: 1, y: 0.4 }, { x: 0, y: 0 }, { x: 1, y: 0.8 }, { x: 2, y: 0 }, 0.1),
    ).toBeLessThan(0);
    expect(evalPrimitiveSdfGpu(curve, 1, 0.4)).toBeLessThan(0);
    const warped = evalWarpWorldGpu(2, 0, { x: 0, y: 0, z: 4, w: 0.35 });
    expect(warped.via).toBe('dualfn');
    expect(warped.x).toBeLessThan(2);
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
    expect(prims.filter((p) => p.kind === PRIM_DISK)).toHaveLength(1);
    expect(prims.filter((p) => p.kind === PRIM_CAPSULE)).toHaveLength(9);
    expect(prims.length).toBe(10);
  });

  it('duck pose lowers the head disk', () => {
    const stand = poseToPrimitives({
      x: 0,
      y: 0,
      facing: 1,
      ducking: false,
      grounded: true,
      wallSliding: false,
      vx: 0,
      vy: 0,
      aimX: 1,
      aimY: 0,
      punching: false,
      blocking: false,
      dead: false,
      phase: 0,
    });
    const duck = poseToPrimitives({
      x: 0,
      y: 0,
      facing: 1,
      ducking: true,
      grounded: true,
      wallSliding: false,
      vx: 0,
      vy: 0,
      aimX: 1,
      aimY: 0,
      punching: false,
      blocking: false,
      dead: false,
      phase: 0,
    });
    const headStand = stand.find((p) => p.kind === PRIM_DISK);
    const headDuck = duck.find((p) => p.kind === PRIM_DISK);
    expect(headDuck?.ay ?? 0).toBeLessThan(headStand?.ay ?? 1);
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
