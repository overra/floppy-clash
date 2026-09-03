import { isRenderPipeline, tgpu, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import type { Renderer } from '../canvas/renderer';
import type { PersistentDecalLayer } from '../fx/decals';
import type { RenderFrame } from '../frame';
import { createLightingPass, type LightingPass } from './lighting';
import { packGroups, parseHex } from './pack';
import {
  alignBytesPerRow,
  emptyReadback,
  inspectMappedRgba,
  PIXEL_BYTES,
  READBACK_H,
  READBACK_W,
  type FramebufferReadback,
} from './readback';
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

let lastGpuInitError = '';

export function getLastGpuInitError(): string {
  return lastGpuInitError;
}

function failInit(reason: string): null {
  lastGpuInitError = reason;
  return null;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
  lastGpuInitError = '';
  if (!('gpu' in navigator) || !navigator.gpu) return failInit('no-navigator-gpu');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return failInit('no-adapter');
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (err) {
    return failInit(`requestDevice: ${errMsg(err)}`);
  }
  let root: TgpuRoot;
  try {
    root = tgpu.initFromDevice({ device });
  } catch (err) {
    return failInit(`tgpu.initFromDevice: ${errMsg(err)}`);
  }
  const context = canvas.getContext('webgpu');
  if (!context) return failInit('no-webgpu-context');
  const format = navigator.gpu.getPreferredCanvasFormat();
  let readbackEnabled = false;
  let readbackError = '';
  try {
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    readbackEnabled = true;
  } catch (err) {
    readbackError = `configure-rejected-copy-src: ${errMsg(err)}`;
    context.configure({ device, format, alphaMode: 'premultiplied' });
  }

  let pipeline;
  try {
    pipeline = createSdfDrawPipeline(root, format);
  } catch (err) {
    return failInit(`createSdfDrawPipeline: ${errMsg(err)}`);
  }
  if (!isRenderPipeline(pipeline) || pipeline.resourceType !== 'render-pipeline') {
    return failInit('pipeline-not-typegpu');
  }
  let decalPipeline;
  try {
    decalPipeline = createDecalDrawPipeline(root, format);
  } catch (err) {
    return failInit(`createDecalDrawPipeline: ${errMsg(err)}`);
  }
  try {
    pipeline.initSync();
    decalPipeline.initSync();
  } catch (err) {
    return failInit(`initSync: ${errMsg(err)}`);
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

  const cropW = READBACK_W;
  const cropH = READBACK_H;
  const bytesPerRow = alignBytesPerRow(cropW * PIXEL_BYTES);
  const stagingSize = bytesPerRow * cropH;
  const mapRead = typeof GPUMapMode !== 'undefined' ? GPUMapMode.READ : 0x0001;
  let staging: GPUBuffer | null = null;
  if (readbackEnabled) {
    try {
      staging = device.createBuffer({
        size: stagingSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    } catch (err) {
      readbackEnabled = false;
      readbackError = `staging-buffer: ${errMsg(err)}`;
    }
  }

  let copyThisFrame = false;
  let readbackLock = false;
  let pendingRead: ((value: FramebufferReadback) => void) | null = null;
  let inflightRead: Promise<FramebufferReadback> | null = null;
  void root;
  (window as unknown as { __gpuKeepAlive?: unknown }).__gpuKeepAlive = { root, device, staging };

  function failRead(reason: string): FramebufferReadback {
    const out = emptyReadback('unavailable', reason);
    pendingRead?.(out);
    pendingRead = null;
    inflightRead = null;
    readbackLock = false;
    return out;
  }

  async function probeMapAsync(): Promise<string> {
    try {
      const src = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const dst = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(src, 0, new Uint8Array([9, 8, 7, 6]));
      const probeEnc = device.createCommandEncoder();
      probeEnc.copyBufferToBuffer(src, 0, dst, 0, 256);
      device.queue.submit([probeEnc.finish()]);
      await dst.mapAsync(mapRead);
      const probeBytes = new Uint8Array(dst.getMappedRange());
      const ok = probeBytes[0] === 9;
      dst.unmap();
      return ok ? 'probe-map:ok' : `probe-map:mismatch:${probeBytes[0] ?? -1}`;
    } catch (err) {
      return `probe-map:${errMsg(err)}`;
    }
  }

  async function finishRead(): Promise<FramebufferReadback> {
    if (!staging) return failRead(readbackError || 'no-staging');
    try {
      if (device.queue.onSubmittedWorkDone) {
        await device.queue.onSubmittedWorkDone();
      }
      await staging.mapAsync(mapRead);
      const mapped = new Uint8Array(staging.getMappedRange().slice(0));
      staging.unmap();
      const out = inspectMappedRgba(mapped, cropW, cropH, bytesPerRow, 'webgpu-copy');
      pendingRead?.(out);
      pendingRead = null;
      inflightRead = null;
      readbackLock = false;
      return out;
    } catch (err) {
      const probe = await probeMapAsync();
      return failRead(`map: ${errMsg(err)}; ${probe}`);
    }
  }
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
    readFramebuffer() {
      if (!readbackEnabled || !staging) {
        return Promise.resolve(emptyReadback('unavailable', readbackError || 'copy-src-disabled'));
      }
      if (inflightRead) return inflightRead;
      inflightRead = new Promise<FramebufferReadback>((resolve) => {
        pendingRead = resolve;
        copyThisFrame = true;
      });
      return inflightRead;
    },
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
      if (readbackLock) {
        renderer.lastGpuMs = performance.now() - t0;
        return;
      }
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
      const current = context.getCurrentTexture();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: current.createView(),
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
      if (copyThisFrame && staging && readbackEnabled) {
        if (w < 1 || h < 1) {
          copyThisFrame = false;
          device.queue.submit([encoder.finish()]);
          failRead('canvas-zero-size');
          renderer.lastGpuMs = performance.now() - t0;
          if (opts.lighting) lighting?.apply(frame, renderer.lastGpuMs, true);
          return;
        }
        const rw = Math.min(cropW, w);
        const rh = Math.min(cropH, h);
        const ox = Math.max(0, Math.floor(w / 2) - Math.floor(rw / 2));
        const oy = Math.max(0, Math.floor(h / 2) - Math.floor(rh / 2));
        try {
          encoder.copyTextureToBuffer(
            { texture: current, origin: { x: ox, y: oy } },
            { buffer: staging, bytesPerRow },
            { width: rw, height: rh },
          );
          copyThisFrame = false;
          readbackLock = true;
          device.queue.submit([encoder.finish()]);
          void finishRead();
          renderer.lastGpuMs = performance.now() - t0;
          return;
        } catch (err) {
          readbackEnabled = false;
          readbackError = `copyTextureToBuffer: ${errMsg(err)}`;
          copyThisFrame = false;
          device.queue.submit([encoder.finish()]);
          failRead(readbackError);
        }
      } else {
        device.queue.submit([encoder.finish()]);
      }
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
    const created = await withTimeout(createGpuRenderer(canvas, opts), 4000);
    if (!created && !lastGpuInitError) lastGpuInitError = 'timeout-or-null';
    return created;
  } catch (err) {
    return failInit(`tryCreate: ${errMsg(err)}`);
  }
}

function parseColor(hex: string): [number, number, number] {
  return parseHex(hex);
}

function hexToRgb(hex: string): GPUColorDict {
  const [r, g, b] = parseColor(hex);
  return { r, g, b, a: 1 };
}
