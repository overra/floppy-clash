import { worldToScreen, type CameraState } from '../camera';
import type { RenderFrame } from '../frame';
import { coverage, opSmoothUnion, opUnion, primitiveSdf } from '../sdf/primitives';

export type PipelineBackend = 'typegpu' | 'none';

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
      blitDecals(ctx, frame, cam, w, h, renderer);
      const layers = [...frame.groups].sort((a, b) => a.layer - b.layer);
      for (const g of layers) {
        ctx.save();
        ctx.strokeStyle = g.color;
        ctx.fillStyle = g.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const p of g.primitives) {
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
          } else {
            const s = worldToScreen(cam, p.ax, p.ay, w, h);
            const rw = p.bx * 2 * cam.zoom;
            const rh = p.by * 2 * cam.zoom;
            ctx.beginPath();
            roundRect(ctx, s.x - rw / 2, s.y - rh / 2, rw, rh, p.r * cam.zoom);
            ctx.fill();
          }
        }
        ctx.restore();
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
