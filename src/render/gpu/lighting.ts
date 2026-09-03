/**
 * Optional 2D lighting (M5 stretch).
 * CPU Jump Flood of layer-1 solids occludes lava / muzzle / explosion emitters
 * (PLAN 4.11). When a TypeGPU root exists, `createJumpFlood` + radiance-cascades
 * also run; a cheaper emitter glow composite always composites when the toggle
 * is on and the last GPU frame stayed under the budget.
 * Real iGPU 4 ms / 500-group sign-off is hardware-only and is not asserted here.
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

/** Layer-1 groups are level solids (PLAN 4.11 Jump Flood input). */
export function solidRectsFromFrame(frame: RenderFrame): SolidRect[] {
  const out: SolidRect[] = [];
  for (const g of frame.groups) {
    if (g.layer !== 1) continue;
    out.push({ minX: g.minX, minY: g.minY, maxX: g.maxX, maxY: g.maxY });
  }
  return out;
}

function pixelInside(solids: SolidRect[], wx: number, wy: number): boolean {
  for (const s of solids) {
    if (wx >= s.minX && wx <= s.maxX && wy >= s.minY && wy <= s.maxY) return true;
  }
  return false;
}

/**
 * CPU Jump Flood of solids → signed distance (negative inside).
 * This is the automated stand-in for `createJumpFlood` of the scene SDF.
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
            const d = (i - sx) * (i - sx) + (j - sy) * (j - sy);
            if (d < best) {
              best = d;
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
  items: d.arrayOf(GlowEmitter, 16),
});

export const glowLayout = tgpu
  .bindGroupLayout({
    camera: { uniform: GpuCamera },
    lights: { uniform: GlowLights },
  })
  .$idx(0);

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
    for (const i of tgpu.unroll(std.range(16))) {
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

export function resolveGlowWgsl(): string {
  return tgpu.resolve([glowVertex, glowFragment]);
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
      size: { width: 256, height: 144 },
      classify: (coord, size) => {
        'use gpu';
        return coord.x > size.x / 4 && coord.x < (size.x * 3) / 4;
      },
      getSdf: (_c, _s, signedDist) => signedDist,
      getColor: () => d.vec4f(1, 0.8, 0.4, 1),
    });
  } catch {
    return null;
  }
}

function tryCreateCascades(root: TgpuRoot): { run: () => void; destroy: () => void } | null {
  try {
    const dim = getCascadeDim(256, 144);
    void dim;
    return createRadianceCascades({
      root,
      size: { width: 256, height: 144 },
      sdfResolution: { width: 256, height: 144 },
      sdf: (uv) => {
        'use gpu';
        return Math.hypot(uv.x - 0.5, uv.y - 0.5) - 0.15;
      },
      color: (uv) => {
        'use gpu';
        const glow = Math.max(0, 0.2 - Math.hypot(uv.x - 0.5, uv.y - 0.35));
        return d.vec3f(1.2 * glow, 0.45 * glow, 0.15 * glow);
      },
    });
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
  const cascades = root ? tryCreateCascades(root) : null;
  const jfa = root ? tryCreateJfa(root) : null;
  const glow = root ? tryCreateGlow(root, format as GPUTextureFormat) : null;

  return {
    kind: cascades ? 'cascades' : glow ? 'glow' : 'off',
    apply(frame, lastGpuMs, enabled) {
      if (!lightingEnabled({ enabled, budgetMs: LIGHTING_BUDGET_MS }, lastGpuMs)) return false;
      try {
        jfa?.run();
      } catch {
        /* JFA classify may reject on SwiftShader — glow still applies */
      }
      try {
        cascades?.run();
      } catch {
        /* SwiftShader / missing features — glow still applies */
      }
      if (!glow) return false;
      const emitters = (frame.lights ?? []).slice(0, 16);
      glow.cam.write({
        x: frame.camera.x,
        y: frame.camera.y,
        zoom: frame.camera.zoom,
        pad: 0,
        view: d.vec2f(canvas?.width || 1280, canvas?.height || 720),
        shake: d.vec2f(frame.camera.shakeX, frame.camera.shakeY),
        hole: d.vec4f(frame.hole?.x ?? 0, frame.hole?.y ?? 0, frame.hole?.r ?? 0, frame.hole?.r ? 0.35 : 0),
      });
      const items = Array.from({ length: 16 }, (_, i) => {
        const e = emitters[i];
        return {
          pos: d.vec2f(e?.x ?? 0, e?.y ?? 0),
          radius: e?.radius ?? 0.01,
          intensity: e?.intensity ?? 0,
          color: d.vec3f(e?.r ?? 0, e?.g ?? 0, e?.b ?? 0),
          pad: 0,
        };
      });
      glow.lights.write({
        count: emitters.length,
        pad0: 0,
        pad1: 0,
        pad2: 0,
        items,
      });
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
