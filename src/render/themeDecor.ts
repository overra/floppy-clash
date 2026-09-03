import type { CameraState } from './camera';
import { groupBounds, type ShapeGroup } from './frame';
import {
  PRIM_BEZIER,
  PRIM_CAPSULE,
  PRIM_DISK,
  PRIM_PIE,
  PRIM_ROUNDED_BOX,
  PRIM_TRIANGLE,
  type Primitive,
} from './sdf/primitives';
import type { ThemePalette } from '../sim/level/themes';

/** PLAN §4.11 pass (1): theme decorations (SDF + parallax). Gradient is a fullscreen pass. */
export function themePassGroups(
  theme: ThemePalette,
  bounds: { x: number; y: number; w: number; h: number },
  cam: CameraState,
  _viewW: number,
  _viewH: number,
): ShapeGroup[] {
  void _viewW;
  void _viewH;
  return themeDecorations(theme, bounds, cam);
}

function themeDecorations(
  theme: ThemePalette,
  bounds: { x: number; y: number; w: number; h: number },
  cam: CameraState,
): ShapeGroup[] {
  const kFar = 0.38;
  const kMid = 0.22;
  const left = bounds.x + 2;
  const right = bounds.x + bounds.w - 2;
  const mid = bounds.x + bounds.w * 0.5;
  const ground = bounds.y + 1.8;
  const top = bounds.y + bounds.h - 1.2;
  const out: ShapeGroup[] = [];
  const push = (color: string, prims: Primitive[], parallax: number) => {
    const shifted = prims.map((p) => shiftPrim(p, cam, parallax));
    out.push({
      ...groupBounds(shifted, 0.5),
      color,
      blend: 'union',
      smoothK: 0,
      layer: 0,
      primitives: shifted,
    });
  };

  if (theme.id === 'woods') {
    push(
      theme.solid,
      [
        { kind: PRIM_ROUNDED_BOX, ax: left + 2, ay: ground + 1.2, bx: 4.5, by: 1.4, r: 0.4 },
        { kind: PRIM_ROUNDED_BOX, ax: mid, ay: ground + 0.9, bx: 5.2, by: 1.1, r: 0.35 },
      ],
      kFar,
    );
    push(
      theme.accent,
      [
        { kind: PRIM_DISK, ax: left + 3, ay: top - 1.5, bx: 0, by: 0, r: 1.6 },
        { kind: PRIM_DISK, ax: right - 3, ay: top - 1.2, bx: 0, by: 0, r: 1.3 },
      ],
      kMid,
    );
    push(
      theme.accent,
      [
        vine(left + 1.2, top, left + 2.4, top - 5.5, -0.9),
        vine(right - 1, top, right - 2.6, top - 4.8, 0.8),
      ],
      kMid,
    );
  } else if (theme.id === 'desert') {
    push(
      theme.solid,
      [
        { kind: PRIM_ROUNDED_BOX, ax: left + 3, ay: ground + 0.7, bx: 5, by: 0.9, r: 0.6 },
        { kind: PRIM_ROUNDED_BOX, ax: right - 3, ay: ground + 0.5, bx: 4.2, by: 0.7, r: 0.5 },
      ],
      kFar,
    );
    push(
      theme.accent,
      [{ kind: PRIM_DISK, ax: right - 2, ay: top - 0.4, bx: 0, by: 0, r: 1.1 }],
      kFar,
    );
  } else if (theme.id === 'factory') {
    push(
      theme.solid,
      [
        { kind: PRIM_CAPSULE, ax: left, ay: top - 1, bx: mid, by: top - 1, r: 0.12 },
        { kind: PRIM_CAPSULE, ax: mid, ay: ground + 3, bx: right, by: ground + 3.4, r: 0.1 },
      ],
      kMid,
    );
    push(
      theme.accent,
      [
        vine(left + 4, top, left + 5.2, ground + 4, 1.4),
        vine(right - 3, top, right - 4.5, ground + 3.5, -1.2),
      ],
      kMid,
    );
  } else if (theme.id === 'castle') {
    push(
      theme.solid,
      [
        { kind: PRIM_ROUNDED_BOX, ax: left + 1.5, ay: ground + 3, bx: 0.7, by: 3.2, r: 0.05 },
        { kind: PRIM_ROUNDED_BOX, ax: right - 1.5, ay: ground + 2.6, bx: 0.6, by: 2.8, r: 0.05 },
      ],
      kFar,
    );
    push(
      theme.accent,
      [{ kind: PRIM_ROUNDED_BOX, ax: mid, ay: top - 0.8, bx: 1.4, by: 0.9, r: 0.04 }],
      kMid,
    );
  } else if (theme.id === 'winter') {
    push(
      theme.solid,
      [
        { kind: PRIM_TRIANGLE, ax: left + 2, ay: ground, bx: left + 3.2, by: ground, r: 2.4 },
        { kind: PRIM_TRIANGLE, ax: right - 3, ay: ground, bx: right - 1.8, by: ground, r: 2.1 },
      ],
      kFar,
    );
    push(
      '#eef6ff',
      [
        { kind: PRIM_DISK, ax: left + 6, ay: ground + 0.4, bx: 0, by: 0, r: 1.1 },
        { kind: PRIM_DISK, ax: mid + 2, ay: ground + 0.3, bx: 0, by: 0, r: 0.8 },
      ],
      kMid,
    );
  } else if (theme.id === 'lava') {
    push(
      theme.hazard,
      [
        { kind: PRIM_DISK, ax: left + 2, ay: ground + 0.6, bx: 0, by: 0, r: 0.7 },
        { kind: PRIM_DISK, ax: right - 2.5, ay: ground + 0.4, bx: 0, by: 0, r: 0.55 },
      ],
      kFar,
    );
    push(theme.accent, [vine(mid - 1, ground + 0.2, mid + 2, ground + 2.2, 0.8)], kMid);
  } else if (theme.id === 'laser') {
    push(
      theme.hazard,
      [
        { kind: PRIM_CAPSULE, ax: left, ay: top - 2, bx: right, by: top - 2, r: 0.03 },
        { kind: PRIM_CAPSULE, ax: left + 1, ay: ground + 4, bx: left + 1, by: top - 1, r: 0.03 },
      ],
      kMid,
    );
  } else if (theme.id === 'western') {
    push(
      theme.solid,
      [
        { kind: PRIM_CAPSULE, ax: left + 2, ay: ground, bx: left + 2, by: ground + 2.2, r: 0.1 },
        {
          kind: PRIM_CAPSULE,
          ax: left + 2.4,
          ay: ground + 1.6,
          bx: left + 1.6,
          by: ground + 1.6,
          r: 0.07,
        },
      ],
      kMid,
    );
    push(theme.accent, [vine(right - 1, top, right - 3.5, ground + 3, -1.6)], kMid);
  } else if (theme.id === 'halloween') {
    push(
      theme.accent,
      [{ kind: PRIM_DISK, ax: right - 2, ay: top - 0.6, bx: 0, by: 0, r: 1.15 }],
      kFar,
    );
    push(
      theme.hazard,
      [vine(left + 1, top, left + 2.8, top - 5, 1.1), vine(mid, top, mid - 1.4, top - 4.2, -0.7)],
      kMid,
    );
  } else {
    push(
      theme.accent,
      [
        { kind: PRIM_CAPSULE, ax: left + 2, ay: top - 1, bx: mid - 2, by: ground + 6, r: 0.08 },
        { kind: PRIM_CAPSULE, ax: right - 2, ay: top - 1, bx: mid + 2, by: ground + 6, r: 0.08 },
      ],
      kFar,
    );
  }
  return out;
}

function vine(x0: number, y0: number, x1: number, y1: number, bow: number): Primitive {
  return {
    kind: PRIM_BEZIER,
    ax: x0,
    ay: y0,
    bx: x1,
    by: y1,
    r: 0.055,
    cx: (x0 + x1) * 0.5 + bow,
    cy: (y0 + y1) * 0.5,
  };
}

function shiftPrim(p: Primitive, cam: CameraState, k: number): Primitive {
  const dx = cam.x * k;
  const dy = cam.y * k * 0.28;
  if (p.kind === PRIM_ROUNDED_BOX || p.kind === PRIM_DISK || p.kind === PRIM_PIE) {
    return { ...p, ax: p.ax + dx, ay: p.ay + dy };
  }
  return {
    ...p,
    ax: p.ax + dx,
    ay: p.ay + dy,
    bx: p.bx + dx,
    by: p.by + dy,
    cx: p.cx !== undefined ? p.cx + dx : p.cx,
    cy: p.cy !== undefined ? p.cy + dy : p.cy,
  };
}

export function lerpHex(a: string, b: string, t: number): string {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  const u = Math.max(0, Math.min(1, t));
  const c = (i: number) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * u);
  return `#${[c(0), c(1), c(2)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length < 6) return [128, 128, 128];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
