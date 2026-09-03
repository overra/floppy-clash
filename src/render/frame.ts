import type { PersistentDecalLayer } from './fx/decals';
import type { LightEmitter } from './gpu/lighting';
import {
  PRIM_BEZIER,
  PRIM_CAPSULE,
  PRIM_DISK,
  PRIM_PIE,
  PRIM_ROUNDED_BOX,
  PRIM_TRIANGLE,
  type Primitive,
} from './sdf/primitives';

export type BlendOp = 'union' | 'smoothUnion' | 'subtract';

export type ShapeGroup = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  color: string;
  blend: BlendOp;
  smoothK: number;
  layer: number;
  primitives: Primitive[];
  fx?: 'none' | 'lava' | 'hole';
};

export type RenderFrame = {
  groups: ShapeGroup[];
  camera: { x: number; y: number; zoom: number; ppm: number; shakeX: number; shakeY: number };
  theme: { top: string; bottom: string; solid: string };
  debug?: {
    bodies: { x: number; y: number; angle: number; hx: number; hy: number }[];
    rays: { x1: number; y1: number; x2: number; y2: number }[];
  };
  lights?: LightEmitter[];
  /** Persistent world-space decal texture; sampled, never rebuilt as groups. */
  decalLayer?: PersistentDecalLayer;
  hud: {
    slowmo: boolean;
    countdown: number;
    notice?: string;
    wins?: number[];
    firstTo?: number;
    showWins?: boolean;
    phase?: number;
    tick?: number;
    hash?: string;
    physicsMs?: number;
    gpuMs?: number;
    entities?: number;
    flash?: number;
  };
};

export function emptyFrame(): RenderFrame {
  return {
    groups: [],
    camera: { x: 16, y: 9, zoom: 1, ppm: 40, shakeX: 0, shakeY: 0 },
    theme: { top: '#333', bottom: '#111', solid: '#666' },
    hud: { slowmo: false, countdown: 0 },
  };
}

export function groupBounds(
  primitives: Primitive[],
  pad = 0.4,
): Pick<ShapeGroup, 'minX' | 'minY' | 'maxX' | 'maxY'> {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of primitives) {
    const b = primitiveBounds(p);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Kind-aware AABB so GPU instanced quads cover rounded-box extents, not `bx`/`by` as points. */
export function primitiveBounds(p: Primitive): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const r = p.r;
  if (p.kind === PRIM_ROUNDED_BOX) {
    const ang = p.cx ?? 0;
    if (Math.abs(ang) < 1e-6) {
      return { minX: p.ax - p.bx, minY: p.ay - p.by, maxX: p.ax + p.bx, maxY: p.ay + p.by };
    }
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const ox of [-p.bx, p.bx]) {
      for (const oy of [-p.by, p.by]) {
        const x = p.ax + ox * c - oy * s;
        const y = p.ay + ox * s + oy * c;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return { minX, minY, maxX, maxY };
  }
  if (p.kind === PRIM_DISK || p.kind === PRIM_PIE) {
    return { minX: p.ax - r, minY: p.ay - r, maxX: p.ax + r, maxY: p.ay + r };
  }
  if (p.kind === PRIM_TRIANGLE) {
    const cx = p.ax + r;
    const cy = p.ay + r;
    return {
      minX: Math.min(p.ax, p.bx, cx),
      minY: Math.min(p.ay, p.by, cy),
      maxX: Math.max(p.ax, p.bx, cx),
      maxY: Math.max(p.ay, p.by, cy),
    };
  }
  const cx = p.kind === PRIM_BEZIER || p.kind === PRIM_CAPSULE ? (p.cx ?? p.ax) : p.ax;
  const cy = p.kind === PRIM_BEZIER || p.kind === PRIM_CAPSULE ? (p.cy ?? p.ay) : p.ay;
  return {
    minX: Math.min(p.ax, p.bx, cx) - r,
    minY: Math.min(p.ay, p.by, cy) - r,
    maxX: Math.max(p.ax, p.bx, cx) + r,
    maxY: Math.max(p.ay, p.by, cy) + r,
  };
}
