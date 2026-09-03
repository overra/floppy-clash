import { perlin2d } from '@typegpu/noise';
import {
  opSmoothDifference,
  opSmoothUnion,
  sdBezier,
  sdDisk,
  sdLine,
  sdPie,
  sdRoundedBox2d,
} from '@typegpu/sdf';
import tgpu, { isTgpuFragmentFn, isTgpuVertexFn, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
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
  cx: d.f32,
  cy: d.f32,
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
  /** world x, y, radius, warp strength */
  hole: d.vec4f,
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

/** IQ-style triangle — same third-point packing as CPU `primitiveSdf` (`c = (ax+r, ay+r)`). */
export const sdTriangleGpu = tgpu.fn(
  [d.vec2f, d.vec2f, d.vec2f, d.vec2f],
  d.f32,
)((p, a, b, c) => {
  'use gpu';
  const e0 = d.vec2f(b.x - a.x, b.y - a.y);
  const e1 = d.vec2f(c.x - b.x, c.y - b.y);
  const e2 = d.vec2f(a.x - c.x, a.y - c.y);
  const v0 = d.vec2f(p.x - a.x, p.y - a.y);
  const v1 = d.vec2f(p.x - b.x, p.y - b.y);
  const v2 = d.vec2f(p.x - c.x, p.y - c.y);
  const d0 = std.max(std.dot(e0, e0), d.f32(1e-6));
  const d1 = std.max(std.dot(e1, e1), d.f32(1e-6));
  const d2 = std.max(std.dot(e2, e2), d.f32(1e-6));
  const h0 = std.clamp(std.dot(v0, e0) / d0, d.f32(0), d.f32(1));
  const h1 = std.clamp(std.dot(v1, e1) / d1, d.f32(0), d.f32(1));
  const h2 = std.clamp(std.dot(v2, e2) / d2, d.f32(0), d.f32(1));
  const pq0 = d.vec2f(v0.x - e0.x * h0, v0.y - e0.y * h0);
  const pq1 = d.vec2f(v1.x - e1.x * h1, v1.y - e1.y * h1);
  const pq2 = d.vec2f(v2.x - e2.x * h2, v2.y - e2.y * h2);
  const s = std.sign(e0.x * e2.y - e0.y * e2.x);
  const c0 = s * (v0.x * e0.y - v0.y * e0.x);
  const c1 = s * (v1.x * e1.y - v1.y * e1.x);
  const c2 = s * (v2.x * e2.y - v2.y * e2.x);
  const md = std.min(std.dot(pq0, pq0), std.min(std.dot(pq1, pq1), std.dot(pq2, pq2)));
  const inside = std.min(c0, std.min(c1, c2));
  return std.select(std.sqrt(md), -std.sqrt(md), inside >= d.f32(0));
});

export const primitiveSdfGpu = tgpu.fn(
  [GpuPrimitive, d.vec2f],
  d.f32,
)((prim, p) => {
  'use gpu';
  if (prim.kind === d.u32(0)) return sdDisk(d.vec2f(p.x - prim.ax, p.y - prim.ay), prim.r);
  if (prim.kind === d.u32(1))
    return sdLine(p, d.vec2f(prim.ax, prim.ay), d.vec2f(prim.bx, prim.by)) - prim.r;
  if (prim.kind === d.u32(2)) {
    const q0 = d.vec2f(p.x - prim.ax, p.y - prim.ay);
    const rot = d.f32(0) - prim.cx;
    const rc = std.cos(rot);
    const rs = std.sin(rot);
    const q = d.vec2f(rc * q0.x - rs * q0.y, rs * q0.x + rc * q0.y);
    return sdRoundedBox2d(q, d.vec2f(prim.bx, prim.by), prim.r);
  }
  if (prim.kind === d.u32(3)) {
    return sdTriangleGpu(
      p,
      d.vec2f(prim.ax, prim.ay),
      d.vec2f(prim.bx, prim.by),
      d.vec2f(prim.ax + prim.r, prim.ay + prim.r),
    );
  }
  if (prim.kind === d.u32(4)) {
    const q = d.vec2f(p.x - prim.ax, p.y - prim.ay);
    const rot = d.f32(0) - prim.by;
    const rc = std.cos(rot);
    const rs = std.sin(rot);
    const qr = d.vec2f(rc * q.x - rs * q.y, rs * q.x + rc * q.y);
    return sdPie(qr, d.vec2f(std.sin(prim.bx), std.cos(prim.bx)), prim.r);
  }
  if (prim.kind === d.u32(5)) {
    const curve = sdBezier(
      p,
      d.vec2f(prim.ax, prim.ay),
      d.vec2f(prim.cx, prim.cy),
      d.vec2f(prim.bx, prim.by),
    );
    return curve - prim.r;
  }
  return d.f32(1e9);
});

export const coverageGpu = tgpu.fn(
  [d.f32],
  d.f32,
)((dist) => {
  'use gpu';
  return dist < d.f32(0) ? d.f32(1) : d.f32(0);
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
  const sx = (w.x - cam.x) * ppm + cam.view.x * d.f32(0.5) + cam.shake.x;
  const sy = cam.view.y * d.f32(0.5) - (w.y - cam.y) * ppm + cam.shake.y;
  const ndcX = (sx / cam.view.x) * d.f32(2) - d.f32(1);
  const ndcY = d.f32(1) - (sy / cam.view.y) * d.f32(2);
  return d.vec4f(ndcX, ndcY, d.f32(0), d.f32(1));
});

export const applyGroupFxGpu = tgpu.fn(
  [GpuGroup, d.vec2f],
  d.vec2f,
)((g, p0) => {
  'use gpu';
  let px = p0.x;
  let py = p0.y;
  if (g.fx === d.u32(1)) {
    const n = perlin2d.sample(d.vec2f(px * d.f32(2.4), py * d.f32(2.4)));
    px = px + n * d.f32(0.06);
    py = py + n * d.f32(0.045);
  }
  if (g.fx === d.u32(2)) {
    const ox = px - (g.minx + g.maxx) * d.f32(0.5);
    const oy = py - (g.miny + g.maxy) * d.f32(0.5);
    const r2 = std.max(ox * ox + oy * oy, d.f32(0.05));
    px = px + ox * (d.f32(0.12) / r2);
    py = py + oy * (d.f32(0.12) / r2);
  }
  return d.vec2f(px, py);
});

/** PLAN 4.11: world-space UV pull toward the live Void Well. */
export const warpWorldGpu = tgpu.fn(
  [d.vec2f, d.vec4f],
  d.vec2f,
)((p, hole) => {
  'use gpu';
  const src = d.vec2f(p.x, p.y);
  if (hole.z <= d.f32(0.05)) return src;
  const dx = src.x - hole.x;
  const dy = src.y - hole.y;
  const dist = std.sqrt(std.max(dx * dx + dy * dy, d.f32(1e-4)));
  const fall = std.saturate(d.f32(1) - dist / hole.z);
  const k = hole.w * fall * fall;
  return d.vec2f(src.x - dx * k, src.y - dy * k);
});

/** PLAN 4.11 post: screen-UV pull. Copies the UV argument (TypeGPU forbids returning it). */
export const warpPostUvGpu = tgpu.fn(
  [d.vec2f, d.vec4f, d.vec2f],
  d.vec2f,
)((uv, hole, view) => {
  'use gpu';
  const src = d.vec2f(uv.x, uv.y);
  if (hole.z <= d.f32(0.05)) return src;
  const px = src.x * view.x;
  const py = src.y * view.y;
  const dx = px - hole.x;
  const dy = py - hole.y;
  const dist = std.sqrt(std.max(dx * dx + dy * dy, d.f32(1e-4)));
  const fall = std.saturate(d.f32(1) - dist / hole.z);
  const k = hole.w * fall * fall;
  return d.vec2f((px - dx * k) / view.x, (py - dy * k) / view.y);
});

export const groupSdfGpu = tgpu.fn(
  [d.u32, d.vec2f],
  d.f32,
)((gid, p) => {
  'use gpu';
  const g = sdfLayout.$.groups[gid]!;
  let dist = d.f32(100000);
  for (const i of tgpu.unroll(std.range(16))) {
    if (g.count > d.u32(i)) {
      const pr = sdfLayout.$.prims[g.start + d.u32(i)]!;
      const pd = primitiveSdfGpu(pr, p);
      if (g.blend === d.u32(1)) {
        dist = smoothUnionGpu(dist, pd, std.max(g.k, d.f32(0.05)));
      } else if (g.blend === d.u32(2)) {
        if (d.u32(i) === d.u32(0)) {
          dist = pd;
        } else {
          dist = opSmoothDifference(dist, pd, std.max(g.k, d.f32(0.04)));
        }
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
    const pad = cam.hole.z * d.f32(0.3);
    let wx = g.minx - pad;
    let wy = g.miny - pad;
    if (
      input.vertexIndex === d.u32(1) ||
      input.vertexIndex === d.u32(2) ||
      input.vertexIndex === d.u32(4)
    ) {
      wx = g.maxx + pad;
    }
    if (
      input.vertexIndex === d.u32(2) ||
      input.vertexIndex === d.u32(4) ||
      input.vertexIndex === d.u32(5)
    ) {
      wy = g.maxy + pad;
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
    const rawx = ((sx / cam.view.x - d.f32(0.5)) * cam.view.x) / ppm + cam.x;
    const rawy = ((d.f32(0.5) - sy / cam.view.y) * cam.view.y) / ppm + cam.y;
    const warped = warpWorldGpu(d.vec2f(rawx, rawy), cam.hole);
    const wx = warped.x;
    const wy = warped.y;
    const p = applyGroupFxGpu(g, d.vec2f(wx, wy));
    const dist = groupSdfGpu(input.gid, p);
    const aa = std.max(std.fwidth(dist), d.f32(0.002));
    const cov = d.f32(1) - std.smoothstep(-aa, aa, dist);
    const outline = d.f32(1) - std.smoothstep(d.f32(0), aa * d.f32(2.4), std.abs(dist));
    const glow = std.exp(-std.max(dist, d.f32(0)) * d.f32(10));
    const shade = d.f32(0.82) + d.f32(0.18) * std.saturate(-dist * d.f32(4));
    const shadowP = applyGroupFxGpu(g, d.vec2f(wx + d.f32(0.08), wy - d.f32(0.08)));
    const shadowDist = groupSdfGpu(input.gid, shadowP);
    const shadow = std.smoothstep(d.f32(0.14), d.f32(-0.02), shadowDist) * d.f32(0.22);
    const rgb = d.vec3f(
      g.color.x * shade + glow * d.f32(0.2) - shadow,
      g.color.y * shade + glow * d.f32(0.2) - shadow,
      g.color.z * shade + glow * d.f32(0.2) - shadow,
    );
    const alpha = std.max(cov, outline * d.f32(0.55));
    if (alpha < d.f32(0.01)) {
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
    let wx = b.minx;
    let wy = b.maxy;
    let u = d.f32(0);
    let v = d.f32(0);
    if (
      input.vertexIndex === d.u32(1) ||
      input.vertexIndex === d.u32(2) ||
      input.vertexIndex === d.u32(4)
    ) {
      wx = b.maxx;
      u = d.f32(1);
    }
    if (
      input.vertexIndex === d.u32(2) ||
      input.vertexIndex === d.u32(4) ||
      input.vertexIndex === d.u32(5)
    ) {
      wy = b.miny;
      v = d.f32(1);
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
    if (c.w < d.f32(0.01)) {
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

/** PLAN §4.11 pass (4): scene blit + slow-mo grade/vignette + hit-stop + hole UV. */
export const GpuPost = d.struct({
  flash: d.f32,
  vignette: d.f32,
  view: d.vec2f,
  /** screen x, y, radius px, warp strength */
  hole: d.vec4f,
});

export const POST_STRIDE = d.sizeOf(GpuPost);

export const postLayout = tgpu
  .bindGroupLayout({
    post: { uniform: GpuPost },
    sceneTex: { texture: d.texture2d(d.f32) },
    sceneSamp: { sampler: 'filtering' },
  })
  .$idx(0);

export const postVertex = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { pos: d.builtin.position },
  })((input) => {
    'use gpu';
    let x = d.f32(-1);
    let y = d.f32(-1);
    if (input.vertexIndex === d.u32(1)) {
      x = d.f32(3);
    } else if (input.vertexIndex === d.u32(2)) {
      y = d.f32(3);
    }
    return { pos: d.vec4f(x, y, d.f32(0), d.f32(1)) };
  })
  .$name('postVertex');

export const postFragment = tgpu
  .fragmentFn({
    in: { pos: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const post = postLayout.$.post;
    const rawUv = d.vec2f(input.pos.x / post.view.x, input.pos.y / post.view.y);
    const uv = warpPostUvGpu(rawUv, post.hole, post.view);
    const color = std.textureSample(postLayout.$.sceneTex, postLayout.$.sceneSamp, uv);
    const cx = uv.x - d.f32(0.5);
    const cy = uv.y - d.f32(0.5);
    const r2 = cx * cx + cy * cy;
    const vig = std.smoothstep(d.f32(0.12), d.f32(0.68), r2) * post.vignette;
    const flashA = std.saturate(post.flash);
    const vigA = std.saturate(vig) * (d.f32(1) - flashA);
    return d.vec4f(
      color.x * (d.f32(1) - vigA) + flashA + vigA * d.f32(0.14),
      color.y * (d.f32(1) - vigA) + flashA + vigA * d.f32(0.05),
      color.z * (d.f32(1) - vigA) + flashA + vigA * d.f32(0.02),
      d.f32(1),
    );
  })
  .$name('postFragment');

export function createPostDrawPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  return root
    .createRenderPipeline({
      vertex: postVertex,
      fragment: postFragment,
      primitive: { topology: 'triangle-list' },
      targets: { format, blend: ALPHA_BLEND },
    })
    .$name('post-draw');
}

/** PLAN §4.11 pass (1): fullscreen theme gradient (not a solid clear). */
export const GpuBg = d.struct({
  top: d.vec4f,
  bottom: d.vec4f,
  view: d.vec2f,
  pad: d.vec2f,
});

export const bgLayout = tgpu
  .bindGroupLayout({
    bg: { uniform: GpuBg },
  })
  .$idx(0);

export const bgVertex = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { pos: d.builtin.position },
  })((input) => {
    'use gpu';
    let x = d.f32(-1);
    let y = d.f32(-1);
    if (input.vertexIndex === d.u32(1)) {
      x = d.f32(3);
    } else if (input.vertexIndex === d.u32(2)) {
      y = d.f32(3);
    }
    return { pos: d.vec4f(x, y, d.f32(0), d.f32(1)) };
  })
  .$name('bgVertex');

export const bgFragment = tgpu
  .fragmentFn({
    in: { pos: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const bg = bgLayout.$.bg;
    const t = std.saturate(input.pos.y / std.max(bg.view.y, d.f32(1)));
    return d.vec4f(
      bg.top.x + (bg.bottom.x - bg.top.x) * t,
      bg.top.y + (bg.bottom.y - bg.top.y) * t,
      bg.top.z + (bg.bottom.z - bg.top.z) * t,
      d.f32(1),
    );
  })
  .$name('bgFragment');

export function createBgDrawPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  return root
    .createRenderPipeline({
      vertex: bgVertex,
      fragment: bgFragment,
      primitive: { topology: 'triangle-list' },
      targets: { format },
    })
    .$name('bg-draw');
}

/** Resolve the live SDF DualFns to WGSL (no GPU device). Proves the draw shaders are TypeGPU. */
export function resolveSdfDrawWgsl(): string {
  return tgpu.resolve([
    sdfVertex,
    sdfFragment,
    warpWorldGpu,
    decalVertex,
    decalFragment,
    postVertex,
    postFragment,
    bgVertex,
    bgFragment,
  ]);
}

export function resolveBgWgsl(): string {
  return tgpu.resolve([bgVertex, bgFragment]);
}

export function resolvePostWgsl(): string {
  return tgpu.resolve([postVertex, postFragment, warpPostUvGpu]);
}

export function isTypeGpuDrawShaders(): boolean {
  return isTgpuVertexFn(sdfVertex) && isTgpuFragmentFn(sdfFragment);
}

/** CPU reference used by tests and the Canvas path — same math as the `'use gpu'` fns. */
export function primitiveSdfCpu(prim: Primitive, px: number, py: number): number {
  return primitiveSdf(prim, { x: px, y: py });
}

/** Invoke the TypeGPU `'use gpu'` DualFn as JS (PLAN §6). DualFn must run or this throws. */
export function evalPrimitiveSdfGpu(prim: Primitive, px: number, py: number): number {
  const out = primitiveSdfGpu(
    {
      kind: prim.kind,
      ax: prim.ax,
      ay: prim.ay,
      bx: prim.bx,
      by: prim.by,
      r: prim.r,
      cx: prim.cx ?? 0,
      cy: prim.cy ?? 0,
    },
    { x: px, y: py } as never,
  );
  const n = Number(out);
  if (!Number.isFinite(n)) {
    throw new Error('evalPrimitiveSdfGpu: DualFn did not return a finite number');
  }
  return n;
}

export function evalCoverageGpu(dist: number): number {
  const n = Number(coverageGpu(dist));
  if (!Number.isFinite(n)) {
    throw new Error('evalCoverageGpu: DualFn did not return a finite number');
  }
  return n;
}

export function evalWarpWorldGpu(
  x: number,
  y: number,
  hole: { x: number; y: number; z: number; w: number },
): { x: number; y: number; via: 'dualfn' } {
  const out = warpWorldGpu({ x, y } as never, hole as never) as { x: number; y: number };
  if (!Number.isFinite(Number(out.x)) || !Number.isFinite(Number(out.y))) {
    throw new Error('evalWarpWorldGpu: DualFn did not return a finite pair');
  }
  return { x: Number(out.x), y: Number(out.y), via: 'dualfn' };
}

export function evalWarpPostUvGpu(
  uvx: number,
  uvy: number,
  hole: { x: number; y: number; z: number; w: number },
  view: { x: number; y: number },
): { x: number; y: number; via: 'dualfn' } {
  const out = warpPostUvGpu({ x: uvx, y: uvy } as never, hole as never, view as never) as {
    x: number;
    y: number;
  };
  if (!Number.isFinite(Number(out.x)) || !Number.isFinite(Number(out.y))) {
    throw new Error('evalWarpPostUvGpu: DualFn did not return a finite pair');
  }
  return { x: Number(out.x), y: Number(out.y), via: 'dualfn' };
}

export function evalSmoothUnionGpu(a: number, b: number, k: number): number {
  const n = Number(smoothUnionGpu(a, b, k));
  if (!Number.isFinite(n)) {
    throw new Error('evalSmoothUnionGpu: DualFn did not return a finite number');
  }
  return n;
}
