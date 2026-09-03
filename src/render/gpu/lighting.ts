/**
 * Optional 2D lighting (M5 stretch).
 *
 * PLAN 4.11: `createJumpFlood` classifies **live layer-1 solids** (not a fixed
 * slab). Cascades evaluate the same live solids plus lava / muzzle / explosion
 * emitters — not a compiled disk SDF. CPU Jump Flood remains the automated
 * stand-in for occlusion tests. Real iGPU 4 ms / 500-group sign-off is
 * hardware-only and is not asserted here.
 */
import { createJumpFlood } from '@typegpu/sdf';
import { createRadianceCascades, getCascadeDim } from '@typegpu/radiance-cascades';
import tgpu, { isRenderPipeline, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { RenderFrame } from '../frame';
import { GpuCamera } from './shaders';

export type LightingOpts = {
  enabled: boolean;
  budgetMs: number;
};

export type LightEmitter = {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
};

export const LIGHTING_BUDGET_MS = 4;
export const MAX_GI_SOLIDS = 32;
export const MAX_GI_LIGHTS = 16;
export const GI_SDF_WIDTH = 256;
export const GI_SDF_HEIGHT = 144;

export function lightingEnabled(opts: LightingOpts, lastGpuMs: number): boolean {
  return opts.enabled && lastGpuMs < opts.budgetMs;
}

export type SolidRect = { minX: number; minY: number; maxX: number; maxY: number };

export type JumpFloodField = {
  dist: Float32Array;
  width: number;
  height: number;
  bounds: { x: number; y: number; w: number; h: number };
};

export type LightingCamera = {
  x: number;
  y: number;
  zoom: number;
  viewX: number;
  viewY: number;
};

/** Layer-1 groups are level solids (PLAN 4.11 Jump Flood input). */
export function solidRectsFromFrame(frame: RenderFrame): SolidRect[] {
  const out: SolidRect[] = [];
  for (const g of frame.groups) {
    if (g.layer !== 1) continue;
    out.push({ minX: g.minX, minY: g.minY, maxX: g.maxX, maxY: g.maxY });
  }
  return out;
}

/** Camera used by GPU classify / cascade SDF (screen UV, y-down). */
export function lightingCameraFromFrame(
  frame: RenderFrame,
  viewX: number,
  viewY: number,
): LightingCamera {
  return {
    x: frame.camera.x,
    y: frame.camera.y,
    zoom: frame.camera.zoom,
    viewX,
    viewY,
  };
}

/** Screen UV → world (matches the glow / GI fragment mapping). */
export function lightingWorldFromUv(
  uvx: number,
  uvy: number,
  cam: LightingCamera,
): { x: number; y: number } {
  const ppm = Math.max(cam.zoom, 1);
  return {
    x: cam.x + ((uvx - 0.5) * cam.viewX) / ppm,
    y: cam.y + ((0.5 - uvy) * cam.viewY) / ppm,
  };
}

/** IQ box SDF. Negative inside the AABB. */
export function boxSdf(px: number, py: number, s: SolidRect): number {
  const cx = (s.minX + s.maxX) * 0.5;
  const cy = (s.minY + s.maxY) * 0.5;
  const hx = (s.maxX - s.minX) * 0.5;
  const hy = (s.maxY - s.minY) * 0.5;
  const dx = Math.abs(px - cx) - hx;
  const dy = Math.abs(py - cy) - hy;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
}

export function sceneSolidSdf(solids: SolidRect[], wx: number, wy: number): number {
  let best = 1e6;
  for (const s of solids) best = Math.min(best, boxSdf(wx, wy, s));
  return best;
}

/**
 * GPU classify reference: JFA pixel is inside iff it lands in a live solid.
 * A fixed center slab would ignore `solids`.
 */
export function classifyLiveSolidAt(
  solids: SolidRect[],
  cam: LightingCamera,
  coordX: number,
  coordY: number,
  sizeX: number,
  sizeY: number,
): boolean {
  const world = lightingWorldFromUv((coordX + 0.5) / sizeX, (coordY + 0.5) / sizeY, cam);
  return sceneSolidSdf(solids, world.x, world.y) < 0;
}

/** UV-space scene SDF (solids + small emitter cores) — CPU stand-in for cascades. */
export function cascadeSceneSdf(
  solids: SolidRect[],
  emitters: LightEmitter[],
  uvx: number,
  uvy: number,
  cam: LightingCamera,
): number {
  const world = lightingWorldFromUv(uvx, uvy, cam);
  let best = sceneSolidSdf(solids, world.x, world.y);
  for (const e of emitters) {
    const er = Math.max(e.radius * 0.12, 0.08);
    best = Math.min(best, Math.hypot(world.x - e.x, world.y - e.y) - er);
  }
  const ppm = Math.max(cam.zoom, 1);
  const span = Math.max(cam.viewX, cam.viewY, 1);
  return best * (ppm / span);
}

function pixelInside(solids: SolidRect[], wx: number, wy: number): boolean {
  for (const s of solids) {
    if (wx >= s.minX && wx <= s.maxX && wy >= s.minY && wy <= s.maxY) return true;
  }
  return false;
}

/**
 * CPU Jump Flood of solids → signed distance (negative inside).
 * Automated stand-in for the GPU `createJumpFlood` texture.
 */
export function jumpFloodSdf(
  solids: SolidRect[],
  bounds: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
): JumpFloodField {
  const n = width * height;
  const inside = new Uint8Array(n);
  const seedX = new Int32Array(n);
  const seedY = new Int32Array(n);
  seedX.fill(-1);
  seedY.fill(-1);
  const wxAt = (i: number) => bounds.x + ((i + 0.5) / width) * bounds.w;
  const wyAt = (j: number) => bounds.y + ((j + 0.5) / height) * bounds.h;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      inside[idx] = pixelInside(solids, wxAt(i), wyAt(j)) ? 1 : 0;
    }
  }
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      const inn = inside[idx]!;
      let boundary = i === 0 || j === 0 || i === width - 1 || j === height - 1;
      if (!boundary) {
        boundary =
          inside[idx - 1] !== inn ||
          inside[idx + 1] !== inn ||
          inside[idx - width] !== inn ||
          inside[idx + width] !== inn;
      }
      if (boundary) {
        seedX[idx] = i;
        seedY[idx] = j;
      }
    }
  }
  for (let step = Math.max(width, height) >> 1; step >= 1; step >>= 1) {
    const nx = seedX.slice();
    const ny = seedY.slice();
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const idx = j * width + i;
        let best = Infinity;
        let bx = nx[idx]!;
        let by = ny[idx]!;
        if (bx >= 0) best = (i - bx) * (i - bx) + (j - by) * (j - by);
        for (let oy = -step; oy <= step; oy += step) {
          for (let ox = -step; ox <= step; ox += step) {
            const ii = i + ox;
            const jj = j + oy;
            if (ii < 0 || jj < 0 || ii >= width || jj >= height) continue;
            const sx = seedX[jj * width + ii]!;
            const sy = seedY[jj * width + ii]!;
            if (sx < 0) continue;
            const d0 = (i - sx) * (i - sx) + (j - sy) * (j - sy);
            if (d0 < best) {
              best = d0;
              bx = sx;
              by = sy;
            }
          }
        }
        nx[idx] = bx;
        ny[idx] = by;
      }
    }
    seedX.set(nx);
    seedY.set(ny);
  }
  const dist = new Float32Array(n);
  const cellW = bounds.w / width;
  const cellH = bounds.h / height;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      const sx = seedX[idx]!;
      const sy = seedY[idx]!;
      const mag = sx >= 0 ? Math.hypot((i - sx) * cellW, (j - sy) * cellH) : 1e6;
      dist[idx] = inside[idx] ? -mag : mag;
    }
  }
  return { dist, width, height, bounds };
}

export function sampleJumpFlood(field: JumpFloodField, wx: number, wy: number): number {
  const u = (wx - field.bounds.x) / field.bounds.w;
  const v = (wy - field.bounds.y) / field.bounds.h;
  if (u < 0 || v < 0 || u > 1 || v > 1) return 1e6;
  const i = Math.min(field.width - 1, Math.max(0, Math.floor(u * field.width)));
  const j = Math.min(field.height - 1, Math.max(0, Math.floor(v * field.height)));
  return field.dist[j * field.width + i]!;
}

/** CPU reference for lava / muzzle / explosion falloff (also used when GPU GI is off). */
export function emitterContribution(
  emitters: LightEmitter[],
  wx: number,
  wy: number,
): { r: number; g: number; b: number } {
  let r = 0,
    g = 0,
    b = 0;
  for (const e of emitters) {
    const dist = Math.hypot(wx - e.x, wy - e.y);
    const t = 1 - Math.min(1, dist / Math.max(e.radius, 0.01));
    if (t <= 0) continue;
    const w = e.intensity * t * t;
    r += e.r * w;
    g += e.g * w;
    b += e.b * w;
  }
  return { r: Math.min(1, r), g: Math.min(1, g), b: Math.min(1, b) };
}

/**
 * Same falloff as `emitterContribution`, but rays that enter the solid SDF
 * (Jump Flood of layer-1 groups) before reaching the emitter are dropped.
 */
export function occludedEmitterContribution(
  field: JumpFloodField,
  emitters: LightEmitter[],
  wx: number,
  wy: number,
): { r: number; g: number; b: number } {
  let r = 0,
    g = 0,
    b = 0;
  for (const e of emitters) {
    const dx = e.x - wx;
    const dy = e.y - wy;
    const dist = Math.hypot(dx, dy);
    if (dist > e.radius) continue;
    let blocked = false;
    if (dist > 0.05) {
      const steps = Math.max(8, Math.ceil(dist / 0.2));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        if (sampleJumpFlood(field, wx + dx * t, wy + dy * t) < -0.04) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;
    const fall = 1 - dist / Math.max(e.radius, 0.01);
    const w = e.intensity * fall * fall;
    r += e.r * w;
    g += e.g * w;
    b += e.b * w;
  }
  return { r: Math.min(1, r), g: Math.min(1, g), b: Math.min(1, b) };
}

export type LightingPass = {
  apply: (frame: RenderFrame, lastGpuMs: number, enabled: boolean) => boolean;
  destroy: () => void;
  kind: 'cascades' | 'glow' | 'off';
};

const GlowEmitter = d.struct({
  pos: d.vec2f,
  radius: d.f32,
  intensity: d.f32,
  color: d.vec3f,
  pad: d.f32,
});

const GlowLights = d.struct({
  count: d.u32,
  pad0: d.u32,
  pad1: d.u32,
  pad2: d.u32,
  items: d.arrayOf(GlowEmitter, MAX_GI_LIGHTS),
});

const GpuSolid = d.struct({
  minX: d.f32,
  minY: d.f32,
  maxX: d.f32,
  maxY: d.f32,
});

const SceneSolids = d.struct({
  count: d.u32,
  pad0: d.u32,
  pad1: d.u32,
  pad2: d.u32,
  items: d.arrayOf(GpuSolid, MAX_GI_SOLIDS),
});

const GiBlit = d.struct({
  view: d.vec2f,
  pad: d.vec2f,
});

/** Shared by JFA classify + cascade SDF/color. Group 1 so JFA/cascade group 0 stays free. */
export const giSceneLayout = tgpu
  .bindGroupLayout({
    camera: { uniform: GpuCamera },
    solids: { uniform: SceneSolids },
    lights: { uniform: GlowLights },
  })
  .$idx(1);

export const glowLayout = tgpu
  .bindGroupLayout({
    camera: { uniform: GpuCamera },
    lights: { uniform: GlowLights },
  })
  .$idx(0);

export const cascadeBlitLayout = tgpu
  .bindGroupLayout({
    blit: { uniform: GiBlit },
    giTex: { texture: d.texture2d(d.f32) },
    giSamp: { sampler: 'filtering' },
  })
  .$idx(0);

export const lightingWorldFromUvGpu = tgpu
  .fn(
    [d.vec2f, GpuCamera],
    d.vec2f,
  )((uv, cam) => {
    'use gpu';
    const ppm = std.max(cam.zoom, d.f32(1));
    const wx = cam.x + ((uv.x - d.f32(0.5)) * cam.view.x) / ppm;
    const wy = cam.y + ((d.f32(0.5) - uv.y) * cam.view.y) / ppm;
    return d.vec2f(wx, wy);
  })
  .$name('lightingWorldFromUvGpu');

export const boxSdfGpu = tgpu
  .fn(
    [d.vec2f, GpuSolid],
    d.f32,
  )((p, s) => {
    'use gpu';
    const cx = (s.minX + s.maxX) * d.f32(0.5);
    const cy = (s.minY + s.maxY) * d.f32(0.5);
    const hx = (s.maxX - s.minX) * d.f32(0.5);
    const hy = (s.maxY - s.minY) * d.f32(0.5);
    const dx = std.abs(p.x - cx) - hx;
    const dy = std.abs(p.y - cy) - hy;
    const ox = std.max(dx, d.f32(0));
    const oy = std.max(dy, d.f32(0));
    return std.sqrt(ox * ox + oy * oy) + std.min(std.max(dx, dy), d.f32(0));
  })
  .$name('boxSdfGpu');

/** Live solids — not `coord.x` in a fixed slab. */
export const classifyLiveSolidGpu = tgpu
  .fn(
    [d.vec2u, d.vec2u],
    d.bool,
  )((coord, size) => {
    'use gpu';
    const cam = giSceneLayout.$.camera;
    const solids = giSceneLayout.$.solids;
    const uv = d.vec2f(
      (d.f32(coord.x) + d.f32(0.5)) / d.f32(size.x),
      (d.f32(coord.y) + d.f32(0.5)) / d.f32(size.y),
    );
    const world = lightingWorldFromUvGpu(uv, cam);
    let hit = d.f32(0);
    for (const i of tgpu.unroll(std.range(MAX_GI_SOLIDS))) {
      if (solids.count > d.u32(i)) {
        const s = solids.items[i]!;
        if (world.x >= s.minX && world.x <= s.maxX && world.y >= s.minY && world.y <= s.maxY) {
          hit = d.f32(1);
        }
      }
    }
    return hit > d.f32(0.5);
  })
  .$name('classifyLiveSolidGpu');

/** Live solid + emitter-core SDF in UV units — not a disk at (0.5, 0.5). */
export const cascadeSceneSdfGpu = tgpu
  .fn(
    [d.vec2f],
    d.f32,
  )((uv) => {
    'use gpu';
    const cam = giSceneLayout.$.camera;
    const solids = giSceneLayout.$.solids;
    const lights = giSceneLayout.$.lights;
    const world = lightingWorldFromUvGpu(uv, cam);
    let best = d.f32(1e6);
    for (const i of tgpu.unroll(std.range(MAX_GI_SOLIDS))) {
      if (solids.count > d.u32(i)) {
        best = std.min(best, boxSdfGpu(world, solids.items[i]!));
      }
    }
    for (const i of tgpu.unroll(std.range(MAX_GI_LIGHTS))) {
      if (lights.count > d.u32(i)) {
        const e = lights.items[i]!;
        const er = std.max(e.radius * d.f32(0.12), d.f32(0.08));
        const ed = std.length(d.vec2f(world.x - e.pos.x, world.y - e.pos.y)) - er;
        best = std.min(best, ed);
      }
    }
    const ppm = std.max(cam.zoom, d.f32(1));
    const span = std.max(cam.view.x, cam.view.y);
    return best * (ppm / std.max(span, d.f32(1)));
  })
  .$name('cascadeSceneSdfGpu');

export const cascadeSceneColorGpu = tgpu
  .fn(
    [d.vec2f],
    d.vec3f,
  )((uv) => {
    'use gpu';
    const cam = giSceneLayout.$.camera;
    const lights = giSceneLayout.$.lights;
    const world = lightingWorldFromUvGpu(uv, cam);
    let accx = d.f32();
    let accy = d.f32();
    let accz = d.f32();
    for (const i of tgpu.unroll(std.range(MAX_GI_LIGHTS))) {
      if (lights.count > d.u32(i)) {
        const e = lights.items[i]!;
        const dist = std.length(d.vec2f(world.x - e.pos.x, world.y - e.pos.y));
        const t = d.f32(1) - std.clamp(dist / std.max(e.radius, d.f32(0.01)), d.f32(0), d.f32(1));
        const w = e.intensity * t * t;
        accx += e.color.x * w;
        accy += e.color.y * w;
        accz += e.color.z * w;
      }
    }
    return d.vec3f(accx, accy, accz);
  })
  .$name('cascadeSceneColorGpu');

export const glowVertex = tgpu
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
    return { pos: d.vec4f(x, y, 0, 1) };
  })
  .$name('glowVertex');

export const glowFragment = tgpu
  .fragmentFn({
    in: { pos: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const cam = glowLayout.$.camera;
    const lights = glowLayout.$.lights;
    const ppm = cam.zoom;
    const wx = ((input.pos.x / cam.view.x - d.f32(0.5)) * cam.view.x) / ppm + cam.x;
    const wy = ((d.f32(0.5) - input.pos.y / cam.view.y) * cam.view.y) / ppm + cam.y;
    let accx = d.f32();
    let accy = d.f32();
    let accz = d.f32();
    for (const i of tgpu.unroll(std.range(MAX_GI_LIGHTS))) {
      if (lights.count > d.u32(i)) {
        const e = lights.items[i]!;
        const dx = wx - e.pos.x;
        const dy = wy - e.pos.y;
        const dist = std.length(d.vec2f(dx, dy));
        const t = d.f32(1) - std.clamp(dist / std.max(e.radius, d.f32(0.01)), d.f32(0), d.f32(1));
        const w = e.intensity * t * t;
        accx += e.color.x * w;
        accy += e.color.y * w;
        accz += e.color.z * w;
      }
    }
    const acc = d.vec3f(accx, accy, accz);
    const warmth = acc.mul(d.f32(0.55));
    return d.vec4f(
      warmth.x,
      warmth.y,
      warmth.z,
      std.min(d.f32(0.45), std.length(acc) * d.f32(0.35)),
    );
  })
  .$name('glowFragment');

export const cascadeBlitVertex = tgpu
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
    return { pos: d.vec4f(x, y, 0, 1) };
  })
  .$name('cascadeBlitVertex');

export const cascadeBlitFragment = tgpu
  .fragmentFn({
    in: { pos: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const blit = cascadeBlitLayout.$.blit;
    const uv = d.vec2f(input.pos.x / blit.view.x, input.pos.y / blit.view.y);
    const c = std.textureSample(cascadeBlitLayout.$.giTex, cascadeBlitLayout.$.giSamp, uv);
    const warmth = c.xyz.mul(d.f32(0.55));
    return d.vec4f(
      warmth.x,
      warmth.y,
      warmth.z,
      std.min(d.f32(0.45), std.length(c.xyz) * d.f32(0.35)),
    );
  })
  .$name('cascadeBlitFragment');

export function resolveGlowWgsl(): string {
  return tgpu.resolve([glowVertex, glowFragment]);
}

export function resolveClassifyWgsl(): string {
  return tgpu.resolve([classifyLiveSolidGpu]);
}

export function resolveCascadeSdfWgsl(): string {
  return tgpu.resolve([cascadeSceneSdfGpu, cascadeSceneColorGpu]);
}

export function resolveCascadeBlitWgsl(): string {
  return tgpu.resolve([cascadeBlitVertex, cascadeBlitFragment]);
}

function emptySolid(): { minX: number; minY: number; maxX: number; maxY: number } {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function emptyLight() {
  return {
    pos: d.vec2f(0, 0),
    radius: 0.01,
    intensity: 0,
    color: d.vec3f(0, 0, 0),
    pad: 0,
  };
}

function cameraPayload(
  frame: RenderFrame,
  viewX: number,
  viewY: number,
): {
  x: number;
  y: number;
  zoom: number;
  pad: number;
  view: d.v2f;
  shake: d.v2f;
  hole: d.v4f;
} {
  return {
    x: frame.camera.x,
    y: frame.camera.y,
    zoom: frame.camera.zoom,
    pad: 0,
    view: d.vec2f(viewX, viewY),
    shake: d.vec2f(frame.camera.shakeX, frame.camera.shakeY),
    hole: d.vec4f(
      frame.hole?.x ?? 0,
      frame.hole?.y ?? 0,
      frame.hole?.r ?? 0,
      frame.hole?.r ? 0.35 : 0,
    ),
  };
}

function solidsPayload(rects: SolidRect[]) {
  const items = Array.from({ length: MAX_GI_SOLIDS }, (_, i) => {
    const s = rects[i];
    return s ? { minX: s.minX, minY: s.minY, maxX: s.maxX, maxY: s.maxY } : emptySolid();
  });
  return { count: rects.length, pad0: 0, pad1: 0, pad2: 0, items };
}

function lightsPayload(emitters: LightEmitter[]) {
  const items = Array.from({ length: MAX_GI_LIGHTS }, (_, i) => {
    const e = emitters[i];
    return e
      ? {
          pos: d.vec2f(e.x, e.y),
          radius: e.radius,
          intensity: e.intensity,
          color: d.vec3f(e.r, e.g, e.b),
          pad: 0,
        }
      : emptyLight();
  });
  return { count: emitters.length, pad0: 0, pad1: 0, pad2: 0, items };
}

function tryCreateGlow(root: TgpuRoot, format: GPUTextureFormat) {
  try {
    const pipeline = root
      .createRenderPipeline({
        vertex: glowVertex,
        fragment: glowFragment,
        primitive: { topology: 'triangle-list' },
        targets: {
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      })
      .$name('glow-draw');
    if (!isRenderPipeline(pipeline)) return null;
    pipeline.initSync();
    const cam = root.createBuffer(GpuCamera).$usage('uniform');
    const lights = root.createBuffer(GlowLights).$usage('uniform');
    const bind = root.createBindGroup(glowLayout, { camera: cam, lights });
    return { pipeline, cam, lights, bind };
  } catch {
    return null;
  }
}

function tryCreateJfa(root: TgpuRoot) {
  try {
    return createJumpFlood({
      root,
      size: { width: GI_SDF_WIDTH, height: GI_SDF_HEIGHT },
      classify: (coord, size) => {
        'use gpu';
        return classifyLiveSolidGpu(coord, size);
      },
      getSdf: (_c, size, signedDist) => {
        'use gpu';
        const maxDim = std.max(d.f32(size.x), d.f32(size.y));
        return signedDist / std.max(maxDim, d.f32(1));
      },
      getColor: () => d.vec4f(1, 0.8, 0.4, 1),
    });
  } catch {
    return null;
  }
}

function tryCreateCascades(root: TgpuRoot) {
  try {
    const dim = getCascadeDim(GI_SDF_WIDTH, GI_SDF_HEIGHT);
    void dim;
    return createRadianceCascades({
      root,
      size: { width: GI_SDF_WIDTH, height: GI_SDF_HEIGHT },
      sdfResolution: { width: GI_SDF_WIDTH, height: GI_SDF_HEIGHT },
      sdf: (uv) => {
        'use gpu';
        return cascadeSceneSdfGpu(uv);
      },
      color: (uv) => {
        'use gpu';
        return cascadeSceneColorGpu(uv);
      },
    });
  } catch {
    return null;
  }
}

function tryCreateCascadeBlit(root: TgpuRoot, format: GPUTextureFormat, output: unknown) {
  if (!output) return null;
  try {
    const pipeline = root
      .createRenderPipeline({
        vertex: cascadeBlitVertex,
        fragment: cascadeBlitFragment,
        primitive: { topology: 'triangle-list' },
        targets: {
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      })
      .$name('cascade-blit');
    if (!isRenderPipeline(pipeline)) return null;
    pipeline.initSync();
    const blit = root.createBuffer(GiBlit).$usage('uniform');
    const giSamp = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const bind = root.createBindGroup(cascadeBlitLayout, {
      blit,
      giTex: output as never,
      giSamp,
    });
    return { pipeline, blit, bind };
  } catch {
    return null;
  }
}

export function createLightingPass(
  root: TgpuRoot | null,
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat | string,
  canvas?: HTMLCanvasElement,
): LightingPass {
  const glow = root ? tryCreateGlow(root, format as GPUTextureFormat) : null;
  const sceneCam = root ? root.createBuffer(GpuCamera).$usage('uniform') : null;
  const sceneSolids = root ? root.createBuffer(SceneSolids).$usage('uniform') : null;
  const sceneLights = root ? root.createBuffer(GlowLights).$usage('uniform') : null;
  const sceneBind =
    root && sceneCam && sceneSolids && sceneLights
      ? root.createBindGroup(giSceneLayout, {
          camera: sceneCam,
          solids: sceneSolids,
          lights: sceneLights,
        })
      : null;

  let jfa = root ? tryCreateJfa(root) : null;
  let cascades = root ? tryCreateCascades(root) : null;
  if (jfa && sceneBind) {
    try {
      jfa = jfa.with(sceneBind);
    } catch {
      jfa = null;
    }
  }
  if (cascades && sceneBind) {
    try {
      cascades = cascades.with(sceneBind);
    } catch {
      cascades = null;
    }
  }
  const blit =
    root && cascades
      ? tryCreateCascadeBlit(root, format as GPUTextureFormat, cascades.output)
      : null;

  return {
    kind: cascades ? 'cascades' : glow ? 'glow' : 'off',
    apply(frame, lastGpuMs, enabled) {
      if (!lightingEnabled({ enabled, budgetMs: LIGHTING_BUDGET_MS }, lastGpuMs)) return false;
      const viewX = canvas?.width || 1280;
      const viewY = canvas?.height || 720;
      const cam = cameraPayload(frame, viewX, viewY);
      const solids = solidRectsFromFrame(frame).slice(0, MAX_GI_SOLIDS);
      const emitters = (frame.lights ?? []).slice(0, MAX_GI_LIGHTS);
      if (sceneCam && sceneSolids && sceneLights) {
        sceneCam.write(cam);
        sceneSolids.write(solidsPayload(solids));
        sceneLights.write(lightsPayload(emitters));
      }
      try {
        jfa?.run();
      } catch {
        /* JFA may reject on SwiftShader — cascades / glow still apply */
      }
      let cascaded = false;
      try {
        cascades?.run();
        cascaded = !!cascades;
      } catch {
        cascaded = false;
      }
      if (cascaded && blit) {
        try {
          blit.blit.write({ view: d.vec2f(viewX, viewY), pad: d.vec2f(0, 0) });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                loadOp: 'load',
                storeOp: 'store',
              },
            ],
          });
          blit.pipeline.with(pass).with(blit.bind).draw(3);
          pass.end();
          device.queue.submit([encoder.finish()]);
          return true;
        } catch {
          /* blit failed — glow fallback */
        }
      }
      if (!glow) return false;
      glow.cam.write(cam);
      glow.lights.write(lightsPayload(emitters));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });
      glow.pipeline.with(pass).with(glow.bind).draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
      return true;
    },
    destroy() {
      try {
        jfa?.destroy();
      } catch {
        /* ignore */
      }
      try {
        cascades?.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
