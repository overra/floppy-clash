import { worldToScreen, type CameraState } from '../camera';
import { DEFAULT_GLOW, Layer, type RenderFrame, type ShapeGroup } from '../frame';
import { PARTICLE_RGBA, emptyParticleQuad, particleQuad, type ParticleSystem } from '../fx/particles';
import { PRIM_CAPSULE, PRIM_DISK, PRIM_PIE, PRIM_ROUNDED_BOX, PRIM_TRIANGLE, parseColor, type Primitive } from '../sdf/primitives';

export type Renderer = {
  kind: 'canvas' | 'gpu';
  render(frame: RenderFrame): void;
  resize(w: number, h: number): void;
  canvas: HTMLCanvasElement;
  /** CPU time spent in `render` (encoding and submitting; the whole draw for the canvas renderer). */
  lastGpuMs: number;
  /** Measured GPU time of the last frame's main pass in ms (timestamp queries), or -1 when unavailable. */
  gpuPassMs: number;
  /** Increments only when a dirty persistent decal texture is uploaded/blitted as a new stamp batch. */
  decalUploads: number;
  /** Backing-store size relative to CSS size × devicePixelRatio; the GPU renderer lowers it when its pass overruns. */
  resolutionScale: number;
};

export function createCanvasRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  let debug = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'F1') debug = !debug;
  };
  window.addEventListener('keydown', onKey);
  let decalTmp: HTMLCanvasElement | null = null;
  // CSS size from the last `resize`; `render` must not read clientWidth (a forced layout mid-frame).
  let cssW = canvas.clientWidth || 1280;
  let cssH = canvas.clientHeight || 720;

  const renderer: Renderer = {
    kind: 'canvas',
    canvas,
    lastGpuMs: 0,
    gpuPassMs: -1,
    decalUploads: 0,
    resolutionScale: 1,
    resize(w: number, h: number) {
      cssW = w;
      cssH = h;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.floor(w * dpr);
      const ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    render(frame: RenderFrame) {
      const t0 = performance.now();
      const w = cssW;
      const h = cssH;
      drawBackground(ctx, frame, w, h);
      const cam: CameraState = {
        x: frame.camera.x,
        y: frame.camera.y,
        zoom: frame.camera.zoom,
        shakeX: frame.camera.shakeX,
        shakeY: frame.camera.shakeY,
        shake: 0,
      };
      // buildFrame hands the groups over sorted by layer (the GPU path relies on it too).
      const layers = frame.groups;
      let i = 0;
      for (; i < layers.length && layers[i]!.layer <= Layer.Hazards; i++) drawGroup(ctx, layers[i]!, cam, w, h);
      decalTmp = blitDecals(ctx, frame, cam, w, h, renderer, decalTmp);
      for (; i < layers.length && layers[i]!.layer <= Layer.Particles; i++) drawGroup(ctx, layers[i]!, cam, w, h);
      if (frame.particles) drawParticles(ctx, frame.particles, cam, w, h);
      for (; i < layers.length; i++) drawGroup(ctx, layers[i]!, cam, w, h);
      if ((frame.hud.flash ?? 0) > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.35, frame.hud.flash! * 0.12)})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (frame.hud.slowmo) {
        ctx.fillStyle = 'rgba(20, 24, 40, 0.18)';
        ctx.fillRect(0, 0, w, h);
      }
      if (debug && frame.debug) {
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 1;
        for (const b of frame.debug.bodies) {
          const s = worldToScreen(cam, b.x, b.y, w, h);
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(-b.angle);
          ctx.strokeRect(-b.hx * cam.zoom, -b.hy * cam.zoom, b.hx * 2 * cam.zoom, b.hy * 2 * cam.zoom);
          ctx.restore();
        }
      }
      renderer.lastGpuMs = performance.now() - t0;
    },
  };
  return renderer;
}

function drawBackground(ctx: CanvasRenderingContext2D, frame: RenderFrame, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, frame.theme.top);
  grad.addColorStop(1, frame.theme.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const vig = frame.theme.vignette ?? 0.35;
  if (vig > 0) {
    const r = Math.hypot(w, h) * 0.5;
    const rad = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    rad.addColorStop(0, 'rgba(0,0,0,0)');
    rad.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, vig)})`);
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Halo without `shadowBlur`: Chrome rasterises every shadowed fill through an offscreen Gaussian
 * blur, and a screen of glowing embers at 2× DPR turned that into 30–100 ms frames. Three widening
 * translucent strokes of the same path read as a soft rim at a tiny fraction of the cost.
 */
const HALO_BANDS = 5;
/** Alpha the bands add up to right at the shape's edge; it falls off roughly quadratically outward. */
const HALO_ALPHA = 0.45;

function strokeHalo(ctx: CanvasRenderingContext2D, r: number, g: number, b: number, a: number, reachPx: number): void {
  const prevWidth = ctx.lineWidth;
  const prevStroke = ctx.strokeStyle;
  ctx.strokeStyle = `rgba(${r},${g},${b},${((a * HALO_ALPHA) / HALO_BANDS).toFixed(3)})`;
  for (let k = HALO_BANDS; k >= 1; k--) {
    // Equal-alpha bands from widest to narrowest: they stack toward the edge, so alpha ramps up there.
    ctx.lineWidth = 2 * reachPx * (k / HALO_BANDS);
    ctx.stroke();
  }
  ctx.lineWidth = prevWidth;
  ctx.strokeStyle = prevStroke;
}

function drawGroup(ctx: CanvasRenderingContext2D, g: ShapeGroup, cam: CameraState, w: number, h: number): void {
  const [r, gg, b, a] = parseColor(g.color);
  if (a <= 0.004) return;
  const r8 = Math.round(r * 255);
  const g8 = Math.round(gg * 255);
  const b8 = Math.round(b * 255);
  const css = `rgba(${r8},${g8},${b8},${a})`;
  ctx.save();
  ctx.fillStyle = css;
  ctx.strokeStyle = css;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const outline = g.style === 'outline';
  if (g.fx === 'glow' || g.fx === 'lava') {
    // Same reach as the GPU halo (metres → px), drawn once around the whole silhouette.
    ctx.beginPath();
    for (const p of g.primitives) tracePrimitive(ctx, p, cam, w, h, 0);
    strokeHalo(ctx, r8, g8, b8, a, Math.max(3, cam.zoom * (g.glow ?? DEFAULT_GLOW)));
  }
  if (g.blend === 'smoothUnion' && !outline) {
    // One path for the whole silhouette (capsules slightly grown to fake the smooth-union bulge at
    // joints), filled once: translucent colors must not stack where limbs overlap.
    ctx.beginPath();
    for (const p of g.primitives) tracePrimitive(ctx, p, cam, w, h, p.kind === PRIM_CAPSULE ? g.smoothK * 0.25 : 0);
    ctx.fill();
  } else {
    for (const p of g.primitives) {
      ctx.beginPath();
      tracePrimitive(ctx, p, cam, w, h, 0);
      if (outline) {
        ctx.lineWidth = Math.max(1.5, cam.zoom * 0.05);
        ctx.stroke();
      } else {
        ctx.fill();
      }
    }
  }
  if (g.style === 'shaded' || g.style === undefined) {
    // faint rim light reads as volume without breaking the flat look; a single fill so overlapping
    // parts of one silhouette do not show as brighter patches
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    for (const p of g.primitives) tracePrimitive(ctx, p, cam, w, h, 0);
    ctx.fill();
  }
  ctx.restore();
}

const particleScratch = emptyParticleQuad();
const particlePrim: Primitive = { kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 0 };

/** Fill alpha is quantised to this many steps so fill styles can be cached and consecutive particles batch. */
const ALPHA_STEPS = 32;
/** `rgba()` strings by palette index × alpha step × (core | halo); built on first use, then reused every frame. */
const particleStyles = new Map<number, string>();

function particleStyle(color: number, alphaStep: number, halo: boolean): string {
  const key = (color << 7) | (alphaStep << 1) | (halo ? 1 : 0);
  let css = particleStyles.get(key);
  if (css === undefined) {
    const rgba = PARTICLE_RGBA[color] ?? PARTICLE_RGBA[0]!;
    const a = (rgba[3] * alphaStep) / ALPHA_STEPS;
    css = `rgba(${Math.round(rgba[0] * 255)},${Math.round(rgba[1] * 255)},${Math.round(rgba[2] * 255)},${(halo ? a * 0.28 : a).toFixed(3)})`;
    particleStyles.set(key, css);
  }
  return css;
}

/**
 * Particles straight from the pool: a flat disk or capsule each. Glowing ones get one wider,
 * fainter fill underneath instead of a shadow (see {@link strokeHalo} for why shadows are out).
 */
function drawParticles(ctx: CanvasRenderingContext2D, sys: ParticleSystem, cam: CameraState, w: number, h: number): void {
  const n = sys.count;
  if (n === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  let lastStyle = '';
  for (let i = 0; i < n; i++) {
    const q = particleQuad(sys, i, particleScratch);
    const step = Math.round(q.alpha * ALPHA_STEPS);
    if (step <= 0) continue;
    particlePrim.kind = q.kind;
    particlePrim.ax = q.ax;
    particlePrim.ay = q.ay;
    particlePrim.bx = q.bx;
    particlePrim.by = q.by;
    particlePrim.r = q.r;
    if (q.glow > 0) {
      const halo = particleStyle(q.color, step, true);
      if (halo !== lastStyle) ctx.fillStyle = lastStyle = halo;
      ctx.beginPath();
      tracePrimitive(ctx, particlePrim, cam, w, h, q.glow * 0.6);
      ctx.fill();
    }
    const core = particleStyle(q.color, step, false);
    if (core !== lastStyle) ctx.fillStyle = lastStyle = core;
    ctx.beginPath();
    tracePrimitive(ctx, particlePrim, cam, w, h, 0);
    ctx.fill();
  }
  ctx.restore();
}

/** Appends the primitive's outline to the current path. `grow` expands the radius (meters). */
function tracePrimitive(ctx: CanvasRenderingContext2D, p: Primitive, cam: CameraState, w: number, h: number, grow: number): void {
  const z = cam.zoom;
  if (p.kind === PRIM_DISK) {
    const s = worldToScreen(cam, p.ax, p.ay, w, h);
    ctx.moveTo(s.x + (p.r + grow) * z, s.y);
    ctx.arc(s.x, s.y, Math.max(0.5, (p.r + grow) * z), 0, Math.PI * 2);
    return;
  }
  if (p.kind === PRIM_CAPSULE) {
    const a = worldToScreen(cam, p.ax, p.ay, w, h);
    const b = worldToScreen(cam, p.bx, p.by, w, h);
    const rr = Math.max(0.75, (p.r + grow) * z);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) {
      ctx.moveTo(a.x + rr, a.y);
      ctx.arc(a.x, a.y, rr, 0, Math.PI * 2);
      return;
    }
    const ang = Math.atan2(dy, dx);
    ctx.moveTo(a.x + Math.cos(ang + Math.PI / 2) * rr, a.y + Math.sin(ang + Math.PI / 2) * rr);
    ctx.arc(a.x, a.y, rr, ang + Math.PI / 2, ang - Math.PI / 2, false);
    ctx.arc(b.x, b.y, rr, ang - Math.PI / 2, ang + Math.PI / 2, false);
    ctx.closePath();
    return;
  }
  const s = worldToScreen(cam, p.ax, p.ay, w, h);
  const rot = p.rot ?? 0;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  // local (y-up, rotated CCW by rot) → screen (y-down)
  const map = (lx: number, ly: number) => ({ x: s.x + (lx * c - ly * sn) * z, y: s.y - (lx * sn + ly * c) * z });
  if (p.kind === PRIM_ROUNDED_BOX) {
    const hx = p.bx + grow;
    const hy = p.by + grow;
    const rr = Math.min(p.r + grow, hx, hy);
    const pts = roundedBoxPath(hx, hy, rr);
    for (let i = 0; i < pts.length; i++) {
      const q = map(pts[i]!.x, pts[i]!.y);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    return;
  }
  if (p.kind === PRIM_TRIANGLE) {
    const a = map(-p.bx - grow, -grow);
    const b = map(p.bx + grow, -grow);
    const t = map(0, p.by + grow);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(t.x, t.y);
    ctx.closePath();
    return;
  }
  if (p.kind === PRIM_PIE) {
    const rr = (p.r + grow) * z;
    ctx.moveTo(s.x, s.y);
    // aperture centered on local +y; canvas angles are clockwise in screen space, so world CCW is negative
    const center = -Math.PI / 2 - rot;
    ctx.arc(s.x, s.y, rr, center - p.bx, center + p.bx, false);
    ctx.closePath();
  }
}

function roundedBoxPath(hx: number, hy: number, r: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const segs = r > 0 ? 4 : 1;
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (i / segs) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };
  corner(hx - r, hy - r, 0);
  corner(-hx + r, hy - r, Math.PI / 2);
  corner(-hx + r, -hy + r, Math.PI);
  corner(hx - r, -hy + r, Math.PI * 1.5);
  return pts;
}

function blitDecals(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrame,
  cam: CameraState,
  w: number,
  h: number,
  renderer: Renderer,
  tmp: HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const layer = frame.decalLayer;
  if (!layer || layer.stamped === 0) return tmp;
  const b = layer.bounds;
  const tl = worldToScreen(cam, b.x, b.y + b.h, w, h);
  const br = worldToScreen(cam, b.x + b.w, b.y, w, h);
  if (layer.dirty) {
    renderer.decalUploads += 1;
    layer.dirty = false;
    if (!layer.canvas) {
      const img = layer.imageData();
      if (img) {
        tmp ??= document.createElement('canvas');
        tmp.width = layer.width;
        tmp.height = layer.height;
        tmp.getContext('2d')?.putImageData(img, 0, 0);
      }
    }
  }
  const src = (layer.canvas as CanvasImageSource | null) ?? tmp;
  if (!src) return tmp;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.restore();
  return tmp;
}
