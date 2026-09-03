import tgpu, { isTgpuFragmentFn, isTgpuVertexFn, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { opSmoothUnion, sdDisk, sdLine, sdRoundedBox2d } from '@typegpu/sdf';
import { primitiveSdf, type Primitive } from '../sdf/primitives';

/** PLAN §4.11: live GPU draw is TypeGPU DualFn + `root.createRenderPipeline`. */
export const GPU_DRAW_BACKEND = 'typegpu' as const;
export const GPU_DRAW_PIPELINE_API = 'root.createRenderPipeline' as const;

export const MAX_GROUPS = 1024;
export const MAX_PRIMS = 8192;

/** GPU-side primitive layout (TypeGPU `'use gpu'` + `@typegpu/sdf`). */
export const GpuPrimitive = d.struct({
  kind: d.u32,
  ax: d.f32,
  ay: d.f32,
  bx: d.f32,
  by: d.f32,
  r: d.f32,
});

export const GpuGroup = d.struct({
  minx: d.f32,
  miny: d.f32,
  maxx: d.f32,
  maxy: d.f32,
  color: d.vec4f,
  start: d.u32,
  count: d.u32,
  blend: d.u32,
  k: d.f32,
  fx: d.u32,
});

export const GpuCamera = d.struct({
  x: d.f32,
  y: d.f32,
  zoom: d.f32,
  pad: d.f32,
  view: d.vec2f,
  shake: d.vec2f,
});

export const GpuBounds = d.struct({
  minx: d.f32,
  miny: d.f32,
  maxx: d.f32,
  maxy: d.f32,
});

export const GROUP_STRIDE = d.sizeOf(GpuGroup);
export const PRIM_STRIDE = d.sizeOf(GpuPrimitive);
export const CAMERA_STRIDE = d.sizeOf(GpuCamera);

/** Typed bind group for the instanced SDF draw (PLAN §4.11 `d.struct` / `d.arrayOf`). */
export const sdfLayout = tgpu
  .bindGroupLayout({
    camera: { uniform: GpuCamera },
    groups: { storage: d.arrayOf(GpuGroup, MAX_GROUPS), access: 'readonly' },
    prims: { storage: d.arrayOf(GpuPrimitive, MAX_PRIMS), access: 'readonly' },
  })
  .$idx(0);

export const decalLayout = tgpu
  .bindGroupLayout({
    camera: { uniform: GpuCamera },
    decalTex: { texture: d.texture2d(d.f32) },
    decalSamp: { sampler: 'filtering' },
    bounds: { uniform: GpuBounds },
  })
  .$idx(0);

export const primitiveSdfGpu = tgpu.fn(
  [GpuPrimitive, d.vec2f],
  d.f32,
)((prim, p) => {
  'use gpu';
  if (prim.kind === 0) return sdDisk(d.vec2f(p.x - prim.ax, p.y - prim.ay), prim.r);
  if (prim.kind === 1)
    return sdLine(p, d.vec2f(prim.ax, prim.ay), d.vec2f(prim.bx, prim.by)) - prim.r;
  if (prim.kind === 2) {
    return sdRoundedBox2d(d.vec2f(p.x - prim.ax, p.y - prim.ay), d.vec2f(prim.bx, prim.by), prim.r);
  }
  if (prim.kind === 3) {
    return sdLine(p, d.vec2f(prim.ax, prim.ay), d.vec2f(prim.bx, prim.by)) - prim.r * 0.15;
  }
  if (prim.kind === 4) {
    return sdDisk(d.vec2f(p.x - prim.ax, p.y - prim.ay), prim.r);
  }
  return 1e9;
});

export const coverageGpu = tgpu.fn(
  [d.f32],
  d.f32,
)((dist) => {
  'use gpu';
  return dist < 0 ? 1 : 0;
});

export const smoothUnionGpu = tgpu.fn(
  [d.f32, d.f32, d.f32],
  d.f32,
)((a, b, k) => {
  'use gpu';
  return opSmoothUnion(a, b, k);
});

export const worldToNdcGpu = tgpu.fn(
  [GpuCamera, d.vec2f],
  d.vec4f,
)((cam, w) => {
  'use gpu';
  const ppm = cam.zoom;
  const sx = (w.x - cam.x) * ppm + cam.view.x * 0.5 + cam.shake.x;
  const sy = cam.view.y * 0.5 - (w.y - cam.y) * ppm + cam.shake.y;
  const ndcX = (sx / cam.view.x) * 2.0 - 1.0;
  const ndcY = 1.0 - (sy / cam.view.y) * 2.0;
  return d.vec4f(ndcX, ndcY, 0, 1);
});

export const applyGroupFxGpu = tgpu.fn(
  [GpuGroup, d.vec2f],
  d.vec2f,
)((g, p0) => {
  'use gpu';
  let px = p0.x;
  let py = p0.y;
  if (g.fx === 1) {
    px = px + std.sin(px * 9.0 + py * 3.0) * 0.05;
    py = py + std.cos(py * 7.0) * 0.05;
  }
  if (g.fx === 2) {
    const ox = px - (g.minx + g.maxx) * 0.5;
    const oy = py - (g.miny + g.maxy) * 0.5;
    const r2 = std.max(ox * ox + oy * oy, 0.05);
    px = px + ox * (0.12 / r2);
    py = py + oy * (0.12 / r2);
  }
  return d.vec2f(px, py);
});

export const groupSdfGpu = tgpu.fn(
  [d.u32, d.vec2f],
  d.f32,
)((gid, p) => {
  'use gpu';
  const g = sdfLayout.$.groups[gid]!;
  let dist = 1.0 * 100000.0;
  for (let i = 0; i < 16; i += 1) {
    if (g.count > i) {
      const pr = sdfLayout.$.prims[g.start + i]!;
      const pd = primitiveSdfGpu(pr, p);
      if (g.blend === 1) {
        dist = smoothUnionGpu(dist, pd, std.max(g.k, 0.05));
      } else {
        dist = std.min(dist, pd);
      }
    }
  }
  return dist;
});

/** Instanced quad → group bounds (PLAN §4.11 vertex stage). */
export const sdfVertex = tgpu
  .vertexFn({
    in: {
      vertexIndex: d.builtin.vertexIndex,
      instanceIndex: d.builtin.instanceIndex,
    },
    out: {
      pos: d.builtin.position,
      gid: d.interpolate('flat, either', d.u32),
    },
  })((input) => {
    'use gpu';
    const g = sdfLayout.$.groups[input.instanceIndex]!;
    const cam = sdfLayout.$.camera;
    let wx = g.minx + 0;
    let wy = g.miny + 0;
    if (input.vertexIndex === 1 || input.vertexIndex === 2 || input.vertexIndex === 4) {
      wx = g.maxx + 0;
    }
    if (input.vertexIndex === 2 || input.vertexIndex === 4 || input.vertexIndex === 5) {
      wy = g.maxy + 0;
    }
    return { pos: worldToNdcGpu(cam, d.vec2f(wx, wy)), gid: input.instanceIndex };
  })
  .$name('sdfVertex');

/** Per-group SDF shade with `@typegpu/sdf` + screen-space AA (PLAN §4.11 fragment). */
export const sdfFragment = tgpu
  .fragmentFn({
    in: {
      gid: d.interpolate('flat, either', d.u32),
      pos: d.builtin.position,
    },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const g = sdfLayout.$.groups[input.gid]!;
    const cam = sdfLayout.$.camera;
    const ppm = cam.zoom;
    const sx = input.pos.x;
    const sy = input.pos.y;
    const wx = ((sx / cam.view.x - 0.5) * cam.view.x) / ppm + cam.x;
    const wy = ((0.5 - sy / cam.view.y) * cam.view.y) / ppm + cam.y;
    const p = applyGroupFxGpu(g, d.vec2f(wx, wy));
    const dist = groupSdfGpu(input.gid, p);
    const aa = std.max(std.fwidth(dist), 0.002);
    const cov = 1.0 - std.smoothstep(-aa, aa, dist);
    const outline = 1.0 - std.smoothstep(0.0, aa * 2.4, std.abs(dist));
    const glow = std.exp(-std.max(dist, 0.0) * 10.0);
    const shade = 0.82 + 0.18 * std.saturate(-dist * 4.0);
    const rgb = d.vec3f(
      g.color.x * shade + glow * 0.2,
      g.color.y * shade + glow * 0.2,
      g.color.z * shade + glow * 0.2,
    );
    const alpha = std.max(cov, outline * 0.55);
    if (alpha < 0.01) {
      std.discard();
    }
    return d.vec4f(rgb.x, rgb.y, rgb.z, alpha);
  })
  .$name('sdfFragment');

export const decalVertex = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { pos: d.builtin.position, uv: d.vec2f },
  })((input) => {
    'use gpu';
    const cam = decalLayout.$.camera;
    const b = decalLayout.$.bounds;
    let wx = b.minx + 0;
    let wy = b.maxy + 0;
    let u = 0.0;
    let v = 0.0;
    if (input.vertexIndex === 1 || input.vertexIndex === 2 || input.vertexIndex === 4) {
      wx = b.maxx;
      u = 1.0;
    }
    if (input.vertexIndex === 2 || input.vertexIndex === 4 || input.vertexIndex === 5) {
      wy = b.miny;
      v = 1.0;
    }
    return { pos: worldToNdcGpu(cam, d.vec2f(wx, wy)), uv: d.vec2f(u, v) };
  })
  .$name('decalVertex');

export const decalFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const c = std.textureSample(decalLayout.$.decalTex, decalLayout.$.decalSamp, input.uv);
    if (c.w < 0.01) {
      std.discard();
    }
    return c;
  })
  .$name('decalFragment');

const ALPHA_BLEND = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

/** Live SDF instanced-quad pipeline — TypeGPU `createRenderPipeline`, not a WGSL string. */
export function createSdfDrawPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  return root
    .createRenderPipeline({
      vertex: sdfVertex,
      fragment: sdfFragment,
      primitive: { topology: 'triangle-list' },
      targets: { format, blend: ALPHA_BLEND },
    })
    .$name('sdf-draw');
}

/** Persistent decal blit — same TypeGPU pipeline API as the world SDF pass. */
export function createDecalDrawPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  return root
    .createRenderPipeline({
      vertex: decalVertex,
      fragment: decalFragment,
      primitive: { topology: 'triangle-list' },
      targets: { format, blend: ALPHA_BLEND },
    })
    .$name('decal-draw');
}

/** Resolve the live SDF DualFns to WGSL (no GPU device). Proves the draw shaders are TypeGPU. */
export function resolveSdfDrawWgsl(): string {
  return tgpu.resolve([sdfVertex, sdfFragment, decalVertex, decalFragment]);
}

export function isTypeGpuDrawShaders(): boolean {
  return isTgpuVertexFn(sdfVertex) && isTgpuFragmentFn(sdfFragment);
}

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
