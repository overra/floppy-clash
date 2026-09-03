import type { LightEmitter } from './gpu/lighting';
import type { Primitive } from './sdf/primitives';

export type BlendOp = 'union' | 'smoothUnion';

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

export function groupBounds(primitives: Primitive[], pad = 0.4): Pick<ShapeGroup, 'minX' | 'minY' | 'maxX' | 'maxY'> {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of primitives) {
    minX = Math.min(minX, p.ax, p.bx);
    minY = Math.min(minY, p.ay, p.by);
    maxX = Math.max(maxX, p.ax, p.bx);
    maxY = Math.max(maxY, p.ay, p.by);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}
