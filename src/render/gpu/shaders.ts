import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { sdDisk, sdLine, opSmoothUnion } from '@typegpu/sdf';
import { primitiveSdf, type Primitive } from '../sdf/primitives';

/** GPU-side primitive layout (TypeGPU `'use gpu'` + `@typegpu/sdf`). */
export const GpuPrimitive = d.struct({
  kind: d.u32,
  ax: d.f32,
  ay: d.f32,
  bx: d.f32,
  by: d.f32,
  r: d.f32,
});

export const primitiveSdfGpu = tgpu.fn([GpuPrimitive, d.vec2f], d.f32)((prim, p) => {
  'use gpu';
  if (prim.kind === 0) return sdDisk(d.vec2f(p.x - prim.ax, p.y - prim.ay), prim.r);
  if (prim.kind === 1) return sdLine(p, d.vec2f(prim.ax, prim.ay), d.vec2f(prim.bx, prim.by)) - prim.r;
  return 1e9;
});

export const coverageGpu = tgpu.fn([d.f32], d.f32)((dist) => {
  'use gpu';
  return dist < 0 ? 1 : 0;
});

export const smoothUnionGpu = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((a, b, k) => {
  'use gpu';
  return opSmoothUnion(a, b, k);
});

/** CPU reference used by tests and the Canvas path — same math as the `'use gpu'` fns. */
export function primitiveSdfCpu(prim: Primitive, px: number, py: number): number {
  return primitiveSdf(prim, { x: px, y: py });
}

/** Invoke the TypeGPU `'use gpu'` DualFns as JS (PLAN §6). Falls back to CPU math. */
export function evalPrimitiveSdfGpu(prim: Primitive, px: number, py: number): number {
  try {
    const out = primitiveSdfGpu(
      { kind: prim.kind, ax: prim.ax, ay: prim.ay, bx: prim.bx, by: prim.by, r: prim.r },
      { x: px, y: py } as never,
    );
    const n = Number(out);
    return Number.isFinite(n) ? n : primitiveSdfCpu(prim, px, py);
  } catch {
    return primitiveSdfCpu(prim, px, py);
  }
}

export function evalCoverageGpu(dist: number): number {
  try {
    const n = Number(coverageGpu(dist));
    return Number.isFinite(n) ? n : dist < 0 ? 1 : 0;
  } catch {
    return dist < 0 ? 1 : 0;
  }
}

export function evalSmoothUnionGpu(a: number, b: number, k: number): number {
  try {
    const n = Number(smoothUnionGpu(a, b, k));
    return Number.isFinite(n) ? n : Math.min(a, b);
  } catch {
    return Math.min(a, b);
  }
}
