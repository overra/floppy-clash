import { isRenderPipeline, tgpu, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import type { Renderer } from '../canvas/renderer';
import type { RenderFrame } from '../frame';
import { createLightingPass, type LightingPass } from './lighting';
import { packGroups, parseHex } from './pack';
import type { PersistentDecalLayer } from '../fx/decals';
import {
  createDecalDrawPipeline,
  createSdfDrawPipeline,
  decalLayout,
  GPU_DRAW_BACKEND,
  GPU_DRAW_PIPELINE_API,
  GpuBounds,
  GpuCamera,
  GpuGroup,
  GpuPrimitive,
  MAX_GROUPS,
  MAX_PRIMS,
  sdfLayout,
} from './shaders';

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

async function createGpuRenderer(
  canvas: HTMLCanvasElement,
  opts: GpuRendererOpts = {},
): Promise<Renderer | null> {
  if (!('gpu' in navigator) || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  let root: TgpuRoot;
  try {
    root = await tgpu.init();
  } catch {
    return null;
  }
  const context = canvas.getContext('webgpu');
  if (!context) return null;
  const device = root.device;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const pipeline = createSdfDrawPipeline(root, format);
  if (!isRenderPipeline(pipeline) || pipeline.resourceType !== 'render-pipeline') {
    return null;
  }
  const decalPipeline = createDecalDrawPipeline(root, format);
  try {
    pipeline.initSync();
    decalPipeline.initSync();
  } catch {
    return null;
  }

  const cameraBuf = root.createBuffer(GpuCamera).$usage('uniform');
  const groupBuf = root.createBuffer(d.arrayOf(GpuGroup, MAX_GROUPS)).$usage('storage');
  const primBuf = root.createBuffer(d.arrayOf(GpuPrimitive, MAX_PRIMS)).$usage('storage');
  const bind = root.createBindGroup(sdfLayout, {
    camera: cameraBuf,
    groups: groupBuf,
    prims: primBuf,
  });

  let lighting: LightingPass | null = null;
  if (opts.lighting) {
    try {
      lighting = createLightingPass(root, device, context, format, canvas);
    } catch {
      lighting = null;
    }
  }

  const decalBoundsBuf = root.createBuffer(GpuBounds).$usage('uniform');
  const decalSampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  let decalTex: GPUTexture | null = null;
  let decalTexW = 0;
  let decalTexH = 0;
  let decalBind: ReturnType<typeof root.createBindGroup> | null = null;

  function uploadDecals(layer: PersistentDecalLayer): void {
    if (!decalTex || !decalBind || layer.dirty) {
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
      decalBind = root.createBindGroup(decalLayout, {
        camera: cameraBuf,
        decalTex: decalTex.createView(),
        decalSamp: decalSampler,
        bounds: decalBoundsBuf,
      });
      layer.dirty = false;
      renderer.decalUploads += 1;
    }
  }

  const renderer: Renderer = {
    kind: 'gpu',
    pipelineBackend: GPU_DRAW_BACKEND,
    pipelineResourceType: pipeline.resourceType,
    pipelineApi: GPU_DRAW_PIPELINE_API,
    canvas,
    lastGpuMs: 0,
    decalUploads: 0,
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
      cameraBuf.write({
        x: frame.camera.x,
        y: frame.camera.y,
        zoom: frame.camera.zoom,
        pad: 0,
        view: d.vec2f(w, h),
        shake: d.vec2f(frame.camera.shakeX, frame.camera.shakeY),
      });
      const packed = packGroups(frame.groups.slice(0, MAX_GROUPS));
      groupBuf.write(packed.groupBytes);
      primBuf.write(packed.primBytes);
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
      if (frame.decalLayer && frame.decalLayer.stamped > 0) {
        const b = frame.decalLayer.bounds;
        decalBoundsBuf.write({ minx: b.x, miny: b.y, maxx: b.x + b.w, maxy: b.y + b.h });
        uploadDecals(frame.decalLayer);
        if (decalBind) {
          decalPipeline.with(pass).with(decalBind).draw(6);
        }
      }
      if (frame.groups.length) {
        pipeline.with(pass).with(bind).draw(6, Math.min(frame.groups.length, MAX_GROUPS));
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
      renderer.lastGpuMs = performance.now() - t0;
      if (opts.lighting) lighting?.apply(frame, renderer.lastGpuMs, true);
    },
  };
  return renderer;
}

export async function tryCreateGpuRenderer(
  canvas: HTMLCanvasElement,
  opts: GpuRendererOpts = {},
): Promise<Renderer | null> {
  try {
    return await withTimeout(createGpuRenderer(canvas, opts), 4000);
  } catch {
    return null;
  }
}

function parseColor(hex: string): [number, number, number] {
  return parseHex(hex);
}

function hexToRgb(hex: string): GPUColorDict {
  const [r, g, b] = parseColor(hex);
  return { r, g, b, a: 1 };
}
