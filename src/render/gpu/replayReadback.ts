import { isRenderPipeline, tgpu, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import type { RenderFrame } from '../frame';
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
  createSdfDrawPipeline,
  GpuCamera,
  GpuGroup,
  GpuPrimitive,
  MAX_GROUPS,
  MAX_PRIMS,
  sdfLayout,
} from './shaders';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Replay the last `RenderFrame` onto a fresh, never-presented device.
 * SwiftShader + canvas present leaves the live TypeGPU device unable to mapAsync
 * ("external Instance reference no longer exists"); a raw `requestDevice` still can.
 */
export async function replayFrameReadback(frame: RenderFrame): Promise<FramebufferReadback> {
  if (!navigator.gpu) return emptyReadback('unavailable', 'replay:no-navigator-gpu');
  let device: GPUDevice | null = null;
  let root: TgpuRoot | null = null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return emptyReadback('unavailable', 'replay:no-adapter');
    device = await adapter.requestDevice();
    root = tgpu.initFromDevice({ device });
    const format = 'rgba8unorm';
    const pipeline = createSdfDrawPipeline(root, format as GPUTextureFormat);
    if (!isRenderPipeline(pipeline)) return emptyReadback('unavailable', 'replay:not-typegpu');
    pipeline.initSync();
    const cameraBuf = root.createBuffer(GpuCamera).$usage('uniform');
    const groupBuf = root.createBuffer(d.arrayOf(GpuGroup, MAX_GROUPS)).$usage('storage');
    const primBuf = root.createBuffer(d.arrayOf(GpuPrimitive, MAX_PRIMS)).$usage('storage');
    const bind = root.createBindGroup(sdfLayout, {
      camera: cameraBuf,
      groups: groupBuf,
      prims: primBuf,
    });
    const w = READBACK_W;
    const h = READBACK_H;
    const bytesPerRow = alignBytesPerRow(w * PIXEL_BYTES);
    const tex = device.createTexture({
      size: { width: w, height: h },
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const staging = device.createBuffer({
      size: bytesPerRow * h,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
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
    const [r, g, b] = parseHex(frame.theme.bottom);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: tex.createView(),
          clearValue: { r, g, b, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    if (frame.groups.length) {
      pipeline.with(pass).with(bind).draw(6, Math.min(frame.groups.length, MAX_GROUPS));
    }
    pass.end();
    encoder.copyTextureToBuffer(
      { texture: tex },
      { buffer: staging, bytesPerRow },
      { width: w, height: h },
    );
    device.queue.submit([encoder.finish()]);
    const mapRead = typeof GPUMapMode !== 'undefined' ? GPUMapMode.READ : 0x0001;
    await staging.mapAsync(mapRead);
    const mapped = new Uint8Array(staging.getMappedRange().slice(0));
    staging.unmap();
    return inspectMappedRgba(mapped, w, h, bytesPerRow, 'webgpu-copy', 'offscreen-replay');
  } catch (err) {
    return emptyReadback('unavailable', `replay: ${errMsg(err)}`);
  } finally {
    try {
      root?.destroy();
    } catch {
      /* ignore */
    }
    try {
      device?.destroy();
    } catch {
      /* ignore */
    }
  }
}
