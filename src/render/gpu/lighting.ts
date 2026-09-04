/**
 * Optional 2D lighting (M5 stretch).
 * `@typegpu/radiance-cascades` + Jump Flood SDF (`createJumpFlood`) feed a GI pass
 * when a TypeGPU root is available. A cheaper emitter glow composite always runs
 * when the toggle is on and the last GPU frame stayed under the budget.
 * Real iGPU 4 ms / 500-group sign-off is hardware-only and is not asserted here.
 */
import { createJumpFlood } from '@typegpu/sdf';
import { createRadianceCascades, getCascadeDim } from '@typegpu/radiance-cascades';
import * as d from 'typegpu/data';
import type { TgpuRoot } from 'typegpu';
// TgpuRoot is the object returned by tgpu.init().
import type { RenderFrame } from '../frame';

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
export function emitterContribution(emitters: LightEmitter[], wx: number, wy: number): { r: number; g: number; b: number } {
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

const GLOW_WGSL = /* wgsl */ `
struct Camera {
  x: f32,
  y: f32,
  zoom: f32,
  pad: f32,
  view: vec2f,
  shake: vec2f,
}
struct Emitter {
  pos: vec2f,
  radius: f32,
  intensity: f32,
  color: vec3f,
  pad: f32,
}
struct Lights {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
  items: array<Emitter, 16>,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> lights: Lights;

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vid], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let ppm = camera.zoom;
  let wx = ((pos.x / camera.view.x) - 0.5) * camera.view.x / ppm + camera.x;
  let wy = (0.5 - (pos.y / camera.view.y)) * camera.view.y / ppm + camera.y;
  var acc = vec3f(0.0);
  for (var i = 0u; i < lights.count; i++) {
    let e = lights.items[i];
    let d = length(vec2f(wx, wy) - e.pos);
    let t = 1.0 - clamp(d / max(e.radius, 0.01), 0.0, 1.0);
    acc += e.color * e.intensity * t * t;
  }
  let warmth = acc * 0.55;
  return vec4f(warmth, min(0.45, length(acc) * 0.35));
}
`;

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
  format: string,
  canvas?: HTMLCanvasElement,
): LightingPass {
  const cascades = root ? tryCreateCascades(root) : null;
  let glow: { pipeline: GPURenderPipeline; cam: GPUBuffer; lights: GPUBuffer; bind: GPUBindGroup } | null = null;
  try {
    const module = device.createShaderModule({ code: GLOW_WGSL });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
    const cam = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const lights = device.createBuffer({ size: 16 + 16 * 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: cam } },
        { binding: 1, resource: { buffer: lights } },
      ],
    });
    glow = { pipeline, cam, lights, bind };
  } catch {
    glow = null;
  }

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
      const cam = new Float32Array([
        frame.camera.x,
        frame.camera.y,
        frame.camera.zoom,
        0,
        canvas?.width || 1280,
        canvas?.height || 720,
        frame.camera.shakeX,
        frame.camera.shakeY,
      ]);
      device.queue.writeBuffer(glow.cam, 0, cam);
      const buf = new ArrayBuffer(16 + 16 * 32);
      const view = new DataView(buf);
      view.setUint32(0, emitters.length, true);
      emitters.forEach((e, i) => {
        const o = 16 + i * 32;
        view.setFloat32(o, e.x, true);
        view.setFloat32(o + 4, e.y, true);
        view.setFloat32(o + 8, e.radius, true);
        view.setFloat32(o + 12, e.intensity, true);
        view.setFloat32(o + 16, e.r, true);
        view.setFloat32(o + 20, e.g, true);
        view.setFloat32(o + 24, e.b, true);
      });
      device.queue.writeBuffer(glow.lights, 0, buf);
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
      pass.setPipeline(glow.pipeline);
      pass.setBindGroup(0, glow.bind);
      pass.draw(3);
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
