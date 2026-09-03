import { tgpu } from 'typegpu';
import { sdDisk, sdLine, sdRoundedBox2d, opSmoothUnion } from '@typegpu/sdf';
import type { Renderer } from '../canvas/renderer';
import type { RenderFrame } from '../frame';
import { primitiveSdf } from '../sdf/primitives';

const WGSL = /* wgsl */ `
struct Camera {
  x: f32,
  y: f32,
  zoom: f32,
  pad: f32,
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
  pad: f32,
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
fn sd_rbox(p: vec2f, c: vec2f, hs: vec2f, r: f32) -> f32 {
  let q = abs(p - c) - hs + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = max(k - abs(a - b), 0.0) / max(k, 1e-5);
  return min(a, b) - h * h * k * 0.25;
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4f {
  let g = groups[input.gid];
  let ppm = camera.zoom;
  let sx = input.pos.x;
  let sy = input.pos.y;
  let wx = ((sx / camera.view.x) - 0.5) * camera.view.x / ppm + camera.x;
  let wy = (0.5 - (sy / camera.view.y)) * camera.view.y / ppm + camera.y;
  let p = vec2f(wx, wy);
  var d = 1e5;
  for (var i = 0u; i < g.count; i++) {
    let pr = prims[g.start + i];
    var pd = 1e5;
    if (pr.kind == 0u) { pd = sd_disk(p, vec2f(pr.ax, pr.ay), pr.r); }
    else if (pr.kind == 1u) { pd = sd_line(p, vec2f(pr.ax, pr.ay), vec2f(pr.bx, pr.by)) - pr.r; }
    else { pd = sd_rbox(p, vec2f(pr.ax, pr.ay), vec2f(pr.bx, pr.by), pr.r); }
    if (g.blend == 1u) { d = smin(d, pd, max(g.k, 0.05)); }
    else { d = min(d, pd); }
  }
  let aa = max(fwidth(d), 0.002);
  let cov = 1.0 - smoothstep(-aa, aa, d);
  if (cov < 0.01) { discard; }
  return vec4f(g.color.rgb, cov);
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

export async function tryCreateGpuRenderer(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  if (!('gpu' in navigator) || !navigator.gpu) return null;
  const adapter = await withTimeout(navigator.gpu.requestAdapter(), 2500);
  if (!adapter) return null;
  let root;
  try {
    root = await withTimeout(tgpu.init(), 2500);
    if (!root) return null;
  } catch {
    return null;
  }
  const context = canvas.getContext('webgpu');
  if (!context) return null;
  const device = root.device;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
    primitive: { topology: 'triangle-list' },
  });

  const cameraBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const groupBuf = device.createBuffer({ size: 64 * 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const primBuf = device.createBuffer({ size: 256 * 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuf } },
      { binding: 1, resource: { buffer: groupBuf } },
      { binding: 2, resource: { buffer: primBuf } },
    ],
  });

  let lastGpuMs = 0;
  const query = device.createQuerySet?.({ type: 'timestamp', count: 2 });
  void query;
  void sdDisk;
  void sdLine;
  void sdRoundedBox2d;
  void opSmoothUnion;
  void primitiveSdf;

  return {
    kind: 'gpu',
    canvas,
    lastGpuMs,
    resize(w: number, h: number) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    },
    render(frame: RenderFrame) {
      const t0 = performance.now();
      const w = canvas.width;
      const h = canvas.height;
      const cam = new Float32Array([frame.camera.x, frame.camera.y, frame.camera.zoom, 0, w, h, frame.camera.shakeX, frame.camera.shakeY]);
      device.queue.writeBuffer(cameraBuf, 0, cam);
      const gData = new ArrayBuffer(Math.max(256, frame.groups.length * 64));
      const pData = new ArrayBuffer(Math.max(256, frame.groups.reduce((n, g) => n + g.primitives.length, 0) * 32));
      const gv = new DataView(gData);
      const pv = new DataView(pData);
      let po = 0;
      let pi = 0;
      frame.groups.forEach((g, i) => {
        const off = i * 64;
        gv.setFloat32(off, g.minX, true);
        gv.setFloat32(off + 4, g.minY, true);
        gv.setFloat32(off + 8, g.maxX, true);
        gv.setFloat32(off + 12, g.maxY, true);
        const c = parseColor(g.color);
        gv.setFloat32(off + 16, c[0], true);
        gv.setFloat32(off + 20, c[1], true);
        gv.setFloat32(off + 24, c[2], true);
        gv.setFloat32(off + 28, 1, true);
        gv.setUint32(off + 32, pi, true);
        gv.setUint32(off + 36, g.primitives.length, true);
        gv.setUint32(off + 40, g.blend === 'smoothUnion' ? 1 : 0, true);
        gv.setFloat32(off + 44, g.smoothK, true);
        for (const p of g.primitives) {
          pv.setUint32(po, p.kind, true);
          pv.setFloat32(po + 4, p.ax, true);
          pv.setFloat32(po + 8, p.ay, true);
          pv.setFloat32(po + 12, p.bx, true);
          pv.setFloat32(po + 16, p.by, true);
          pv.setFloat32(po + 20, p.r, true);
          po += 32;
          pi += 1;
        }
      });
      device.queue.writeBuffer(groupBuf, 0, gData);
      device.queue.writeBuffer(primBuf, 0, pData);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: hexToRgb(frame.theme.bottom),
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      if (frame.groups.length) pass.draw(6, frame.groups.length);
      pass.end();
      device.queue.submit([encoder.finish()]);
      lastGpuMs = performance.now() - t0;
    },
  };
}

function parseColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function hexToRgb(hex: string): GPUColorDict {
  const [r, g, b] = parseColor(hex);
  return { r, g, b, a: 1 };
}
