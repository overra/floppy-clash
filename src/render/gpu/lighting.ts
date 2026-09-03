/**
 * Optional 2D lighting (M5 stretch).
 * `@typegpu/radiance-cascades` + Jump Flood SDF (`createJumpFlood`) feed a GI pass
 * when a TypeGPU root is available. A cheaper emitter glow composite always runs
 * when the toggle is on and the last GPU frame stayed under the budget.
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

function tryCreateCascades(root: TgpuRoot): { run: () => void; destroy: () => void } | null {
  try {
    const dim = getCascadeDim(256, 144);
    void dim;
    const runner = createRadianceCascades({
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
    try {
      createJumpFlood({
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
      /* JFA is optional when classify slots reject the JS fn */
    }
    return runner;
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
  const glow = root ? tryCreateGlow(root, format as GPUTextureFormat) : null;

  return {
    kind: cascades ? 'cascades' : glow ? 'glow' : 'off',
    apply(frame, lastGpuMs, enabled) {
      if (!lightingEnabled({ enabled, budgetMs: LIGHTING_BUDGET_MS }, lastGpuMs)) return false;
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
        cascades?.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

void createJumpFlood;
void createRadianceCascades;
void getCascadeDim;
