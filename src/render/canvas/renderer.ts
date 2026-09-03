import { worldToScreen, type CameraState } from '../camera';
import type { RenderFrame, ShapeGroup } from '../frame';
import {
  emptyReadback,
  inspectMappedRgba,
  PIXEL_BYTES,
  READBACK_H,
  READBACK_W,
  type FramebufferReadback,
} from '../gpu/readback';
import { coverage, opSmoothUnion, opUnion, primitiveSdf } from '../sdf/primitives';

export type PipelineBackend = 'typegpu' | 'none';
export type { FramebufferReadback };

export type Renderer = {
  kind: 'canvas' | 'gpu';
  /** Live draw path: TypeGPU `root.createRenderPipeline`, or none for Canvas. */
  pipelineBackend: PipelineBackend;
  pipelineResourceType: 'render-pipeline' | '';
  pipelineApi: 'root.createRenderPipeline' | '';
  render(frame: RenderFrame): void;
  resize(w: number, h: number): void;
  canvas: HTMLCanvasElement;
  lastGpuMs: number;
  /** Increments only when a dirty persistent decal texture is uploaded/blitted as a new stamp batch. */
  decalUploads: number;
  /** PLAN §6: pixels from the live framebuffer (WebGPU copy or Canvas 2D). */
  readFramebuffer(): Promise<FramebufferReadback>;
};

export function createCanvasRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  let debug = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'F1') debug = !debug;
  };
  window.addEventListener('keydown', onKey);

  const renderer: Renderer = {
    kind: 'canvas',
    pipelineBackend: 'none',
    pipelineResourceType: '',
    pipelineApi: '',
    canvas,
    lastGpuMs: 0,
    decalUploads: 0,
    async readFramebuffer() {
      const w = Math.min(READBACK_W, canvas.width);
      const h = Math.min(READBACK_H, canvas.height);
      if (w < 1 || h < 1) return emptyReadback('unavailable', 'canvas-empty');
      try {
        const data = ctx.getImageData(0, 0, w, h).data;
        return inspectMappedRgba(
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
          w,
          h,
          w * PIXEL_BYTES,
          'canvas-2d',
        );
      } catch (err) {
        return emptyReadback('unavailable', err instanceof Error ? err.message : String(err));
      }
    },
    resize(w: number, h: number) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    render(frame: RenderFrame) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, frame.theme.top);
      grad.addColorStop(1, frame.theme.bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const cam: CameraState = {
        x: frame.camera.x,
        y: frame.camera.y,
        zoom: frame.camera.zoom,
        shakeX: frame.camera.shakeX,
        shakeY: frame.camera.shakeY,
        shake: 0,
      };
      const layers = [...frame.groups].sort((a, b) => a.layer - b.layer);
      drawCanvasGroups(
        ctx,
        layers.filter((g) => g.layer <= 0),
        cam,
        w,
        h,
      );
      blitDecals(ctx, frame, cam, w, h, renderer);
      drawCanvasGroups(
        ctx,
        layers.filter((g) => g.layer > 0),
        cam,
        w,
        h,
      );
      if (frame.hud.slowmo) {
        const vig = ctx.createRadialGradient(
          w / 2,
          h / 2,
          Math.min(w, h) * 0.22,
          w / 2,
          h / 2,
          Math.max(w, h) * 0.72,
        );
        vig.addColorStop(0, 'rgba(40, 18, 6, 0.06)');
        vig.addColorStop(1, 'rgba(10, 4, 2, 0.36)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
      }
      if ((frame.hud.flash ?? 0) > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.35, frame.hud.flash! * 0.12)})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (frame.hud.countdown > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 96px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(frame.hud.countdown), w / 2, h / 2);
      }
      if (debug && frame.debug) {
        ctx.strokeStyle = '#0f0';
        for (const b of frame.debug.bodies) {
          const s = worldToScreen(cam, b.x, b.y, w, h);
          ctx.strokeRect(
            s.x - b.hx * cam.zoom,
            s.y - b.hy * cam.zoom,
            b.hx * 2 * cam.zoom,
            b.hy * 2 * cam.zoom,
          );
        }
      }
      void coverage;
      void opSmoothUnion;
      void opUnion;
      void primitiveSdf;
    },
  };
  return renderer;
}

function drawCanvasGroups(
  ctx: CanvasRenderingContext2D,
  groups: ShapeGroup[],
  cam: CameraState,
  w: number,
  h: number,
): void {
  for (const g of groups) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    g.primitives.forEach((p, pi) => {
      if (g.blend === 'subtract' && pi > 0) {
        ctx.strokeStyle = 'rgba(20,12,8,0.45)';
        ctx.fillStyle = 'rgba(20,12,8,0.45)';
      } else {
        ctx.strokeStyle = g.color;
        ctx.fillStyle = g.color;
      }
      if (p.kind === 0) {
        const s = worldToScreen(cam, p.ax, p.ay, w, h);
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.r * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 1) {
        const a = worldToScreen(cam, p.ax, p.ay, w, h);
        const b = worldToScreen(cam, p.bx, p.by, w, h);
        ctx.lineWidth = Math.max(2, p.r * 2 * cam.zoom);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (p.kind === 3) {
        const a = worldToScreen(cam, p.ax, p.ay, w, h);
        const b = worldToScreen(cam, p.bx, p.by, w, h);
        const c = worldToScreen(cam, p.ax + p.r, p.ay + p.r, w, h);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 4) {
        const s = worldToScreen(cam, p.ax, p.ay, w, h);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.arc(s.x, s.y, p.r * cam.zoom, -p.bx + p.by, p.bx + p.by);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 5) {
        const a = worldToScreen(cam, p.ax, p.ay, w, h);
        const cx = p.cx ?? (p.ax + p.bx) * 0.5;
        const cy = p.cy ?? (p.ay + p.by) * 0.5;
        const c = worldToScreen(cam, cx, cy, w, h);
        const b = worldToScreen(cam, p.bx, p.by, w, h);
        ctx.lineWidth = Math.max(2, p.r * 2 * cam.zoom);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        ctx.stroke();
      } else {
        const s = worldToScreen(cam, p.ax, p.ay, w, h);
        const rw = p.bx * 2 * cam.zoom;
        const rh = p.by * 2 * cam.zoom;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(-(p.cx ?? 0));
        ctx.beginPath();
        roundRect(ctx, -rw / 2, -rh / 2, rw, rh, p.r * cam.zoom);
        ctx.fill();
        ctx.restore();
      }
    });
    ctx.restore();
  }
}

function blitDecals(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrame,
  cam: CameraState,
  w: number,
  h: number,
  renderer: Renderer,
): void {
  const layer = frame.decalLayer;
  if (!layer || layer.stamped === 0) return;
  const src = layer.canvas ?? layer.imageData();
  if (!src) return;
  const b = layer.bounds;
  const tl = worldToScreen(cam, b.x, b.y + b.h, w, h);
  const br = worldToScreen(cam, b.x + b.w, b.y, w, h);
  if (layer.dirty) {
    renderer.decalUploads += 1;
    layer.dirty = false;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ('data' in src) {
    const tmp = document.createElement('canvas');
    tmp.width = layer.width;
    tmp.height = layer.height;
    tmp.getContext('2d')?.putImageData(src, 0, 0);
    ctx.drawImage(tmp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  } else {
    ctx.drawImage(src as CanvasImageSource, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
