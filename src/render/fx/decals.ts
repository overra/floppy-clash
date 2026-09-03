import type { World } from 'koota';
import { raycastClosest, type RayHit } from '../../sim/physics/queries';
import type { Decal } from './particles';

export type WorldBounds = { x: number; y: number; w: number; h: number };

const SURFACE_KINDS = new Set(['solid', 'prop', 'hazard']);
/** How far a splash travels to find something to stain: below first (pooling), then walls, then ceilings. */
const SNAP_DOWN = 1.1;
const SNAP_SIDE = 0.7;

function notSurface(h: RayHit): boolean {
  return !SURFACE_KINDS.has(h.kind);
}

/**
 * Blood only stains what it lands on. Move a decal onto the nearest surface (embedding it so most of the
 * mark reads on the body, not the sky), or reject it when the splash is well clear of everything.
 */
export function snapDecalToSurface(world: World, d: Decal): boolean {
  const probes: [number, number, number][] = [
    [0, -SNAP_DOWN, 0.55],
    [SNAP_SIDE, 0, 0.5],
    [-SNAP_SIDE, 0, 0.5],
    [0, SNAP_SIDE, 0.5],
  ];
  for (const [dx, dy, embed] of probes) {
    const hit = raycastClosest(world, d.x, d.y, d.x + dx, d.y + dy, notSurface);
    if (!hit) continue;
    // Standing inside the body already: keep it where it is.
    if (hit.fraction < 0.05) return true;
    const len = Math.hypot(dx, dy) || 1;
    d.x = hit.x + (dx / len) * d.r * embed;
    d.y = hit.y + (dy / len) * d.r * embed;
    return true;
  }
  return false;
}

/**
 * Persistent world-space decal texture (PLAN 4.11).
 * Blood / scorch are stamped once into a CPU (and optional canvas) buffer.
 * Renderers sample this texture; marks are not rebuilt as SDF groups per frame.
 */
export type PersistentDecalLayer = {
  bounds: WorldBounds;
  ppm: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  stamped: number;
  stampCalls: number;
  dirty: boolean;
  consumed: number;
  stamp: (d: Decal) => void;
  stampNew: (decals: Decal[], accept?: (d: Decal) => boolean) => number;
  clear: () => void;
  sample: (wx: number, wy: number) => [number, number, number, number];
  imageData: () => ImageData | null;
  hashPixels: () => number;
  canvas: HTMLCanvasElement | OffscreenCanvas | null;
};

function align(n: number, a: number): number {
  return Math.ceil(n / a) * a;
}

export function createDecalLayer(bounds: WorldBounds, ppm = 16): PersistentDecalLayer {
  const width = Math.max(64, align(Math.ceil(Math.max(1, bounds.w) * ppm), 64));
  const height = Math.max(1, Math.ceil(Math.max(1, bounds.h) * ppm));
  const pixels = new Uint8ClampedArray(width * height * 4);
  let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  let ctx2d: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    canvas = c;
    ctx2d = c.getContext('2d');
  }

  const layer: PersistentDecalLayer = {
    bounds: { ...bounds },
    ppm,
    width,
    height,
    pixels,
    stamped: 0,
    stampCalls: 0,
    dirty: false,
    consumed: 0,
    canvas,
    stamp(d) {
      stampDisk(layer, d);
    },
    stampNew(decals, accept) {
      let n = 0;
      for (let i = layer.consumed; i < decals.length; i++) {
        const d = decals[i]!;
        if (accept && !accept(d)) continue;
        stampDisk(layer, d);
        n += 1;
      }
      layer.consumed = decals.length;
      return n;
    },
    clear() {
      pixels.fill(0);
      layer.stamped = 0;
      layer.stampCalls = 0;
      layer.consumed = 0;
      layer.dirty = true;
      ctx2d?.clearRect(0, 0, width, height);
    },
    sample(wx, wy) {
      const { px, py } = worldToPixel(layer, wx, wy);
      if (px < 0 || py < 0 || px >= width || py >= height) return [0, 0, 0, 0];
      const o = (py * width + px) * 4;
      return [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!, pixels[o + 3]!];
    },
    imageData() {
      if (typeof ImageData === 'undefined') return null;
      return new ImageData(pixels, width, height);
    },
    hashPixels() {
      return hashPixels(layer);
    },
  };
  return layer;
}

export function worldToPixel(layer: PersistentDecalLayer, wx: number, wy: number): { px: number; py: number } {
  const { bounds, ppm, height } = layer;
  const px = Math.floor((wx - bounds.x) * ppm);
  const py = Math.floor((bounds.y + bounds.h - wy) * ppm);
  return { px, py: Math.min(height - 1, Math.max(0, py)) };
}

function parseRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length < 6) return [90, 16, 16];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function stampDisk(layer: PersistentDecalLayer, d: Decal): void {
  const [r, g, b] = parseRgb(d.color);
  const { px: cx, py: cy } = worldToPixel(layer, d.x, d.y);
  const rad = Math.max(1, Math.ceil(d.r * layer.ppm));
  const { width, height, pixels } = layer;
  for (let y = cy - rad; y <= cy + rad; y++) {
    if (y < 0 || y >= height) continue;
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || x >= width) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > rad * rad) continue;
      const o = (y * width + x) * 4;
      const cover = 1 - Math.sqrt(dx * dx + dy * dy) / (rad + 0.01);
      const a = Math.min(255, Math.round(200 * cover) + pixels[o + 3]!);
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = a;
    }
  }
  layer.stamped += 1;
  layer.stampCalls += 1;
  layer.dirty = true;
  const ctx = layer.canvas && 'getContext' in layer.canvas ? layer.canvas.getContext('2d') : null;
  if (ctx) {
    // Mirror the pixel buffer's linear falloff so the canvas fallback shows the same soft splat the GPU samples.
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.78)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function hashPixels(layer: PersistentDecalLayer): number {
  let h = 2166136261;
  const p = layer.pixels;
  for (let i = 0; i < p.length; i += 17) {
    h ^= p[i]!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
