import { tgpu } from 'typegpu';
import { sdDisk, sdLine, sdRoundedBox2d, opSmoothUnion } from '@typegpu/sdf';
import type { Renderer } from '../canvas/renderer';
import { Layer, type RenderFrame } from '../frame';
import { primitiveSdf } from '../sdf/primitives';
import { createLightingPass, type LightingPass } from './lighting';
import { packInto, packedColor } from './pack';
import type { PersistentDecalLayer } from '../fx/decals';

const WGSL = /* wgsl */ `
struct Camera {
  x: f32,
  y: f32,
  zoom: f32,
  time: f32,
  view: vec2f,
  shake: vec2f,
}
struct Prim {
  kind: u32,
  ax: f32,
  ay: f32,
  bx: f32,
  by: f32,
  r: f32,
  rot: f32,
  pad: f32, // keeps the array stride at 32 bytes to match pack.ts PRIM_STRIDE
}
struct Group {
  minx: f32,
  miny: f32,
  maxx: f32,
  maxy: f32,
  color: vec4f,
  start: u32,
  count: u32,
  blend: u32,
  k: f32,
  fx: u32,
  style: u32,
  glow: f32, // halo reach in metres; the quad is padded to contain it (see frame.ts group())
  spare: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> groups: array<Group>;
@group(0) @binding(2) var<storage, read> prims: array<Prim>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) gid: u32,
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
  var o: VSOut;
  let g = groups[iid];
  let corners = array<vec2f, 6>(
    vec2f(g.minx, g.miny), vec2f(g.maxx, g.miny), vec2f(g.maxx, g.maxy),
    vec2f(g.minx, g.miny), vec2f(g.maxx, g.maxy), vec2f(g.minx, g.maxy),
  );
  let w = corners[vid];
  let ppm = camera.zoom;
  let sx = (w.x - camera.x) * ppm + camera.view.x * 0.5 + camera.shake.x;
  let sy = camera.view.y * 0.5 - (w.y - camera.y) * ppm + camera.shake.y;
  let ndc = vec2f((sx / camera.view.x) * 2.0 - 1.0, 1.0 - (sy / camera.view.y) * 2.0);
  o.pos = vec4f(ndc, 0.0, 1.0);
  o.gid = iid;
  return o;
}

fn sd_disk(p: vec2f, c: vec2f, r: f32) -> f32 { return length(p - c) - r; }
fn sd_line(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}
fn sd_rbox(p: vec2f, hs: vec2f, r: f32) -> f32 {
  let rr = min(r, min(hs.x, hs.y));
  let q = abs(p) - hs + vec2f(rr);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - rr;
}
fn sd_tri(p: vec2f, a: vec2f, b: vec2f, c: vec2f) -> f32 {
  let e0 = b - a; let e1 = c - b; let e2 = a - c;
  let v0 = p - a; let v1 = p - b; let v2 = p - c;
  let pq0 = v0 - e0 * clamp(dot(v0, e0) / max(dot(e0, e0), 1e-6), 0.0, 1.0);
  let pq1 = v1 - e1 * clamp(dot(v1, e1) / max(dot(e1, e1), 1e-6), 0.0, 1.0);
  let pq2 = v2 - e2 * clamp(dot(v2, e2) / max(dot(e2, e2), 1e-6), 0.0, 1.0);
  let s = sign(e0.x * e2.y - e0.y * e2.x);
  let d = min(min(vec2f(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                  vec2f(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                  vec2f(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
fn sd_pie(p: vec2f, r: f32, half: f32) -> f32 {
  let q = vec2f(abs(p.x), p.y);
  let sc = vec2f(sin(half), cos(half));
  let l = length(q) - r;
  let m = length(q - sc * clamp(dot(q, sc), 0.0, r));
  return max(l, m * sign(sc.y * q.x - sc.x * q.y));
}
fn rot2(p: vec2f, a: f32) -> vec2f {
  let c = cos(a); let s = sin(a);
  return vec2f(p.x * c - p.y * s, p.x * s + p.y * c);
}
fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = max(k - abs(a - b), 0.0) / max(k, 1e-5);
  return min(a, b) - h * h * k * 0.25;
}
fn hash21(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4f {
  let g = groups[input.gid];
  let ppm = camera.zoom;
  let sx = input.pos.x - camera.shake.x;
  let sy = input.pos.y - camera.shake.y;
  let wx = ((sx / camera.view.x) - 0.5) * camera.view.x / ppm + camera.x;
  let wy = (0.5 - (sy / camera.view.y)) * camera.view.y / ppm + camera.y;
  var p = vec2f(wx, wy);
  if (g.fx == 1u) {
    let t = camera.time;
    p = p + vec2f(sin(p.x * 6.0 + t * 2.0 + p.y * 3.0), cos(p.y * 5.0 + t * 1.7 + p.x * 2.0)) * 0.05;
  }
  if (g.fx == 2u) {
    let o = p - vec2f(g.minx + g.maxx, g.miny + g.maxy) * 0.5;
    let r2 = max(dot(o, o), 0.05);
    p = p + o * (0.12 / r2);
  }
  var d = 1e5;
  for (var i = 0u; i < g.count; i++) {
    let pr = prims[g.start + i];
    var pd = 1e5;
    if (pr.kind == 0u) { pd = sd_disk(p, vec2f(pr.ax, pr.ay), pr.r); }
    else if (pr.kind == 1u) { pd = sd_line(p, vec2f(pr.ax, pr.ay), vec2f(pr.bx, pr.by)) - pr.r; }
    else {
      let q = rot2(p - vec2f(pr.ax, pr.ay), -pr.rot);
      if (pr.kind == 2u) { pd = sd_rbox(q, vec2f(pr.bx, pr.by), pr.r); }
      else if (pr.kind == 3u) { pd = sd_tri(q, vec2f(-pr.bx, 0.0), vec2f(pr.bx, 0.0), vec2f(0.0, pr.by)) - pr.r; }
      else { pd = sd_pie(q, pr.r, pr.bx); }
    }
    if (g.blend == 1u) { d = smin(d, pd, max(g.k, 0.05)); }
    else { d = min(d, pd); }
  }
  let aa = max(fwidth(d), 0.002);
  let cov = 1.0 - smoothstep(-aa, aa, d);
  var rgb = g.color.rgb;
  var alpha = cov * g.color.a;
  if (g.style == 2u) {
    // outline only
    let rim = 1.0 - smoothstep(0.0, aa * 2.0 + 0.02, abs(d));
    alpha = rim * g.color.a;
  } else if (g.style == 0u) {
    // soft inner shade: slightly darker toward the bottom-right of the shape, faint rim light
    let inner = saturate(-d * 6.0);
    let tone = 0.9 + 0.1 * inner;
    rgb = rgb * tone;
    let rim = 1.0 - smoothstep(0.0, aa * 1.5 + 0.01, abs(d));
    rgb = rgb + vec3f(rim * 0.06);
  }
  // Halos are finite: they fade to exactly zero at g.glow metres, which is where the quad ends,
  // so the gradient is never sliced off by the instance bounds.
  let reach = max(g.glow, 1e-3);
  if (g.fx == 1u) {
    // lava: bright core with animated bands
    let bands = 0.5 + 0.5 * sin((p.x * 3.0 + p.y * 1.5) + camera.time * 3.0);
    rgb = mix(rgb, vec3f(1.0, 0.85, 0.35), 0.35 * bands * saturate(-d * 2.5));
    let t = saturate(max(d, 0.0) / reach);
    let halo = exp(-max(d, 0.0) * 4.0) * (1.0 - t) * (1.0 - t) * 0.55;
    alpha = max(alpha, halo * g.color.a);
    rgb = mix(rgb, vec3f(1.0, 0.45, 0.1), halo * (1.0 - cov));
  }
  if (g.fx == 3u) {
    // glow hugs the edge: outside the shape for fills, both sides for outlines (never floods the interior)
    let dist = select(max(d, 0.0), abs(d), g.style == 2u);
    let t = saturate(dist / reach);
    let halo = (1.0 - t) * (1.0 - t) * 0.75;
    let edge = select(1.0 - cov, 1.0, g.style == 2u);
    alpha = max(alpha, halo * g.color.a * edge);
    rgb = rgb + vec3f(halo * 0.3) * edge;
  }
  if (alpha < 0.004) { discard; }
  return vec4f(rgb * alpha, alpha);
}
`;

const BG_WGSL = /* wgsl */ `
struct Bg {
  top: vec4f,
  bottom: vec4f,
  view: vec2f,
  vignette: f32,
  time: f32,
}
@group(0) @binding(0) var<uniform> bg: Bg;
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
  var o: VSOut;
  let xy = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = xy[vid];
  o.pos = vec4f(p, 0.0, 1.0);
  o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}
@fragment
fn fs(input: VSOut) -> @location(0) vec4f {
  let t = smoothstep(0.0, 1.0, input.uv.y);
  var c = mix(bg.top.rgb, bg.bottom.rgb, t);
  let d = input.uv - vec2f(0.5);
  let vig = 1.0 - bg.vignette * smoothstep(0.35, 0.95, length(d * vec2f(1.0, bg.view.y / max(bg.view.x, 1.0)) * 1.4));
  c = c * vig;
  return vec4f(c, 1.0);
}
`;

const DECAL_WGSL = /* wgsl */ `
struct Camera {
  x: f32,
  y: f32,
  zoom: f32,
  pad: f32,
  view: vec2f,
  shake: vec2f,
}
struct Bounds {
  minx: f32,
  miny: f32,
  maxx: f32,
  maxy: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var decalTex: texture_2d<f32>;
@group(0) @binding(2) var decalSamp: sampler;
@group(0) @binding(3) var<uniform> bounds: Bounds;
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
  var o: VSOut;
  let corners = array<vec2f, 6>(
    vec2f(bounds.minx, bounds.maxy), vec2f(bounds.maxx, bounds.maxy), vec2f(bounds.maxx, bounds.miny),
    vec2f(bounds.minx, bounds.maxy), vec2f(bounds.maxx, bounds.miny), vec2f(bounds.minx, bounds.miny),
  );
  let uvs = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let w = corners[vid];
  let ppm = camera.zoom;
  let sx = (w.x - camera.x) * ppm + camera.view.x * 0.5 + camera.shake.x;
  let sy = camera.view.y * 0.5 - (w.y - camera.y) * ppm + camera.shake.y;
  o.pos = vec4f((sx / camera.view.x) * 2.0 - 1.0, 1.0 - (sy / camera.view.y) * 2.0, 0.0, 1.0);
  o.uv = uvs[vid];
  return o;
}
@fragment
fn fs(input: VSOut) -> @location(0) vec4f {
  let c = textureSample(decalTex, decalSamp, input.uv);
  if (c.a < 0.01) { discard; }
  return c;
}
`;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

export type GpuRendererOpts = {
  lighting?: boolean;
};

/** Measured pass time (p90 over a window) above which the render scale steps down. */
export const GPU_BUDGET_MS = 4.5;
/** Pass time below which a scaled-down renderer steps back up; `GPU_BUDGET_MS * RESOLUTION_STEP²` is the no-oscillation ceiling. */
export const GPU_RELAX_MS = 2.6;
/** Linear scale step: pixel count moves by the square (0.85² ≈ 0.72) per step. */
export const RESOLUTION_STEP = 0.85;
export const MIN_RESOLUTION_SCALE = 0.5;
/** Frames per decision; ~⅓ s at 120 Hz so the scale follows a battle rather than a single frame. */
export const RESOLUTION_WINDOW = 40;

/**
 * Next render-resolution scale given the current one and the window's median and p90 GPU pass times.
 * Both directions need strong evidence: a step down needs the *median* over budget (sustained load,
 * not a few frames of GPU contention from another app), a step up needs even the *p90* under the
 * relax line. Pure so the hysteresis can be tested: stepping down from just over the budget lands
 * above the relax line, and stepping up from just under the relax line lands under the budget.
 */
export function nextResolutionScale(scale: number, medMs: number, p90Ms: number = medMs): number {
  if (medMs > GPU_BUDGET_MS && scale > MIN_RESOLUTION_SCALE) {
    return Math.max(MIN_RESOLUTION_SCALE, scale * RESOLUTION_STEP);
  }
  if (p90Ms < GPU_RELAX_MS && scale < 1) {
    return Math.min(1, scale / RESOLUTION_STEP);
  }
  return scale;
}

async function createGpuRenderer(canvas: HTMLCanvasElement, opts: GpuRendererOpts = {}): Promise<Renderer> {
  if (!('gpu' in navigator) || !navigator.gpu) throw new Error('navigator.gpu missing');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no adapter');
  let root;
  try {
    // Timestamp queries are optional: with them the F3 overlay shows real GPU pass time, without
    // them it shows nothing rather than failing to start.
    root = await tgpu.init({ device: { optionalFeatures: ['timestamp-query'] } });
  } catch (err) {
    throw new Error(`device init failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('no webgpu canvas context');
  const device = root.device;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const premultiplied = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  device.addEventListener?.('uncapturederror', (ev) => {
    console.error('[render] WebGPU error:', (ev as { error?: { message?: string } }).error?.message ?? ev);
  });
  const module = device.createShaderModule({ code: WGSL });
  void module.getCompilationInfo?.().then((info) => {
    for (const m of info.messages) {
      if (m.type === 'error') console.error(`[render] WGSL ${m.lineNum}:${m.linePos} ${m.message}`);
    }
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format, blend: premultiplied }] },
    primitive: { topology: 'triangle-list' },
  });
  const bgModule = device.createShaderModule({ code: BG_WGSL });
  const bgPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: bgModule, entryPoint: 'vs' },
    fragment: { module: bgModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const bgBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bgBind = device.createBindGroup({
    layout: bgPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: bgBuf } }],
  });

  const cameraBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const GROUP_CAP = 4096;
  const PRIM_CAP = 32768;
  const groupBuf = device.createBuffer({ size: GROUP_CAP * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const primBuf = device.createBuffer({ size: PRIM_CAP * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuf } },
      { binding: 1, resource: { buffer: groupBuf } },
      { binding: 2, resource: { buffer: primBuf } },
    ],
  });
  const startTime = performance.now();

  let lighting: LightingPass | null = null;
  if (opts.lighting) {
    try {
      lighting = createLightingPass(root, device, context, format, canvas);
    } catch {
      lighting = null;
    }
  }
  const decalModule = device.createShaderModule({ code: DECAL_WGSL });
  const decalPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: decalModule, entryPoint: 'vs' },
    fragment: {
      module: decalModule,
      entryPoint: 'fs',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const decalBoundsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const decalSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  let decalTex: GPUTexture | null = null;
  let decalTexW = 0;
  let decalTexH = 0;
  let decalBind: GPUBindGroup | null = null;

  void sdDisk;
  void sdLine;
  void sdRoundedBox2d;
  void opSmoothUnion;
  void primitiveSdf;

  function uploadDecals(layer: PersistentDecalLayer): void {
    if (!layer.dirty && decalTex && decalBind) return;
    if (!decalTex || decalTexW !== layer.width || decalTexH !== layer.height) {
      decalTex?.destroy();
      decalTex = device.createTexture({
        size: { width: layer.width, height: layer.height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      decalTexW = layer.width;
      decalTexH = layer.height;
    }
    device.queue.writeTexture(
      { texture: decalTex },
      layer.pixels,
      { bytesPerRow: layer.width * 4 },
      { width: layer.width, height: layer.height },
    );
    decalBind = device.createBindGroup({
      layout: decalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: cameraBuf } },
        { binding: 1, resource: decalTex.createView() },
        { binding: 2, resource: decalSampler },
        { binding: 3, resource: { buffer: decalBoundsBuf } },
      ],
    });
    layer.dirty = false;
    renderer.decalUploads += 1;
  }

  // GPU pass timing: two timestamps around the main pass, resolved into a small ring of read-back
  // buffers so mapping never stalls the frame. Only when the device granted the feature.
  const timing = device.features.has('timestamp-query')
    ? {
        query: device.createQuerySet({ type: 'timestamp', count: 2 }),
        resolve: device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
        reads: Array.from({ length: 4 }, () => ({
          buf: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
          busy: false,
        })),
      }
    : null;

  const camScratch = new Float32Array(8);
  const bgScratch = new Float32Array(12);
  const decalBoundsScratch = new Float32Array(4);
  const clearScratch: GPUColorDict = { r: 0, g: 0, b: 0, a: 1 };

  // Dynamic resolution. The pass cost is almost purely per-pixel and SDFs are resolution-independent,
  // so when the GPU overruns its share of the 120 Hz budget we shade fewer pixels and let the
  // compositor stretch the canvas; once it has headroom again we scale back up. Decisions come from a
  // window of measured pass times so a single noisy frame never flips the scale, and the step ratio
  // leaves hysteresis between the two thresholds (a step down lands above the relax line and a step
  // up lands below the budget line). Needs timestamp queries; without them the scale stays at 1.
  let cssW = 0;
  let cssH = 0;
  const passHist = new Float32Array(RESOLUTION_WINDOW);
  const passSorted = new Float32Array(RESOLUTION_WINDOW);
  let passFilled = 0;

  function applySize(): void {
    if (cssW <= 0 || cssH <= 0) return;
    const ratio = (window.devicePixelRatio || 1) * renderer.resolutionScale;
    const pw = Math.max(1, Math.floor(cssW * ratio));
    const ph = Math.max(1, Math.floor(cssH * ratio));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
  }

  function onPassSample(ms: number): void {
    passHist[passFilled++] = ms;
    if (passFilled < RESOLUTION_WINDOW) return;
    passFilled = 0;
    passSorted.set(passHist);
    passSorted.sort();
    const med = passSorted[RESOLUTION_WINDOW >> 1]!;
    const p90 = passSorted[Math.floor(RESOLUTION_WINDOW * 0.9)]!;
    const next = nextResolutionScale(renderer.resolutionScale, med, p90);
    if (next !== renderer.resolutionScale) {
      renderer.resolutionScale = next;
      applySize();
    }
  }

  const renderer: Renderer = {
    kind: 'gpu',
    canvas,
    lastGpuMs: 0,
    gpuPassMs: -1,
    decalUploads: 0,
    resolutionScale: 1,
    resize(w: number, h: number) {
      if (w !== cssW || h !== cssH) {
        cssW = w;
        cssH = h;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      applySize();
    },
    render(frame: RenderFrame) {
      const t0 = performance.now();
      const w = canvas.width;
      const h = canvas.height;
      // Device pixels per CSS pixel of the *current* backing store (includes the resolution scale).
      const dpr = cssW > 0 ? w / cssW : window.devicePixelRatio || 1;
      const time = (performance.now() - startTime) / 1000;
      camScratch[0] = frame.camera.x;
      camScratch[1] = frame.camera.y;
      camScratch[2] = frame.camera.zoom * dpr;
      camScratch[3] = time;
      camScratch[4] = w;
      camScratch[5] = h;
      camScratch[6] = frame.camera.shakeX * dpr;
      camScratch[7] = frame.camera.shakeY * dpr;
      device.queue.writeBuffer(cameraBuf, 0, camScratch);
      const top = packedColor(frame.theme.top);
      const bottom = packedColor(frame.theme.bottom);
      bgScratch.set([top[0], top[1], top[2], 1, bottom[0], bottom[1], bottom[2], 1, w, h, frame.theme.vignette ?? 0.35, time]);
      device.queue.writeBuffer(bgBuf, 0, bgScratch);
      // Groups (and particles, straight from their pool) are packed into reusable scratch memory and
      // uploaded from it; nothing is allocated per frame.
      const packed = packInto(frame.groups, GROUP_CAP, PRIM_CAP, frame.particles);
      const visible = frame.groups;
      if (packed.groupBytes > 0) device.queue.writeBuffer(groupBuf, 0, packed.groups, 0, packed.groupBytes);
      if (packed.primBytes > 0) device.queue.writeBuffer(primBuf, 0, packed.prims, 0, packed.primBytes);
      const encoder = device.createCommandEncoder();
      const read = timing?.reads.find((r) => !r.busy);
      clearScratch.r = bottom[0];
      clearScratch.g = bottom[1];
      clearScratch.b = bottom[2];
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: clearScratch,
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        timestampWrites: timing && read ? { querySet: timing.query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } : undefined,
      });
      pass.setPipeline(bgPipeline);
      pass.setBindGroup(0, bgBind);
      pass.draw(3, 1);
      // Groups arrive sorted by layer: world geometry first, then decals splat on top of it,
      // then everything that should occlude the decals (props, actors, fx).
      // (Instance i is group i up to the particle run, which sits above the hazards.)
      let below = 0;
      const nGroups = Math.min(packed.groupCount, visible.length);
      while (below < nGroups && visible[below]!.layer <= Layer.Hazards) below++;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      if (below > 0) pass.draw(6, below);
      if (frame.decalLayer && frame.decalLayer.stamped > 0) {
        const b = frame.decalLayer.bounds;
        decalBoundsScratch[0] = b.x;
        decalBoundsScratch[1] = b.y;
        decalBoundsScratch[2] = b.x + b.w;
        decalBoundsScratch[3] = b.y + b.h;
        device.queue.writeBuffer(decalBoundsBuf, 0, decalBoundsScratch);
        uploadDecals(frame.decalLayer);
        if (decalBind) {
          pass.setPipeline(decalPipeline);
          pass.setBindGroup(0, decalBind);
          pass.draw(6, 1);
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bind);
        }
      }
      if (packed.groupCount > below) pass.draw(6, packed.groupCount - below, 0, below);
      pass.end();
      if (timing && read) {
        encoder.resolveQuerySet(timing.query, 0, 2, timing.resolve, 0);
        encoder.copyBufferToBuffer(timing.resolve, 0, read.buf, 0, 16);
      }
      device.queue.submit([encoder.finish()]);
      if (timing && read) {
        read.busy = true;
        read.buf.mapAsync(GPUMapMode.READ).then(
          () => {
            const ts = new BigUint64Array(read.buf.getMappedRange());
            const ns = Number(ts[1]! - ts[0]!);
            read.buf.unmap();
            read.busy = false;
            // A pair from different timer epochs (device idle/reset) reads as days; anything over a
            // second is a glitch, not a pass.
            if (ns >= 0 && ns < 1e9) {
              renderer.gpuPassMs = ns / 1e6;
              onPassSample(renderer.gpuPassMs);
            }
          },
          () => {
            read.busy = false;
          },
        );
      }
      renderer.lastGpuMs = performance.now() - t0;
      if (opts.lighting) lighting?.apply(frame, renderer.lastGpuMs, true);
    },
  };
  return renderer;
}

let gpuFailure: string | null = null;

/** Why the last {@link tryCreateGpuRenderer} came back empty ("timed out", "no adapter", ...), for the UI notice. */
export function gpuFailureReason(): string | null {
  return gpuFailure;
}

/**
 * Resolves the renderer, or null after `timeoutMs`. A timed-out attempt keeps running: if it lands
 * later, `onLate` gets it so the caller can still upgrade from the canvas fallback.
 */
export async function tryCreateGpuRenderer(
  canvas: HTMLCanvasElement,
  opts: GpuRendererOpts = {},
  timeoutMs = 12000,
  onLate?: (renderer: Renderer) => void,
): Promise<Renderer | null> {
  // First-run pipeline compilation on an integrated GPU (or a throttled background tab) can
  // take several seconds; giving up early would strand a capable machine on the fallback.
  const attempt = createGpuRenderer(canvas, opts);
  try {
    const renderer = await withTimeout(attempt, timeoutMs);
    if (renderer) {
      gpuFailure = null;
      return renderer;
    }
    gpuFailure = 'timed out';
    console.warn('[render] WebGPU renderer timed out, using canvas');
    attempt.then(
      (late) => onLate?.(late),
      () => undefined,
    );
    return null;
  } catch (err) {
    gpuFailure = err instanceof Error ? err.message : String(err);
    console.warn('[render] WebGPU renderer unavailable, using canvas:', err);
    return null;
  }
}
