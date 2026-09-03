import type { Vec2 } from '../../core/math';
import { length, sub } from '../../core/math';

export const PRIM_DISK = 0;
export const PRIM_CAPSULE = 1;
export const PRIM_ROUNDED_BOX = 2;
export const PRIM_TRIANGLE = 3;
export const PRIM_PIE = 4;

/**
 * One SDF primitive. Encodings (all in world meters, y-up):
 * - DISK:        center (ax, ay), radius r.
 * - CAPSULE:     segment (ax, ay) → (bx, by), radius r.
 * - ROUNDED_BOX: center (ax, ay), half extents (bx, by), corner radius r, rotation rot.
 * - TRIANGLE:    isosceles; base center (ax, ay), half base bx, height by (apex along +y), rounding r, rotation rot.
 * - PIE:         center (ax, ay), radius r, half aperture bx (radians, opening along +y), rotation rot.
 */
export type Primitive = {
  kind: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  rot?: number;
};

export function sdDisk(p: Vec2, center: Vec2, radius: number): number {
  return length(sub(p, center)) - radius;
}

export function sdLine(p: Vec2, a: Vec2, b: Vec2): number {
  const pax = p.x - a.x;
  const pay = p.y - a.y;
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay || 1)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

export function sdCapsule(p: Vec2, a: Vec2, b: Vec2, radius: number): number {
  return sdLine(p, a, b) - radius;
}

export function sdRoundedBox(p: Vec2, center: Vec2, halfW: number, halfH: number, radius: number): number {
  const dx = Math.abs(p.x - center.x) - halfW + radius;
  const dy = Math.abs(p.y - center.y) - halfH + radius;
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Signed distance to an arbitrary triangle (Inigo Quilez). */
export function sdTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): number {
  const e0x = b.x - a.x;
  const e0y = b.y - a.y;
  const e1x = c.x - b.x;
  const e1y = c.y - b.y;
  const e2x = a.x - c.x;
  const e2y = a.y - c.y;
  const v0x = p.x - a.x;
  const v0y = p.y - a.y;
  const v1x = p.x - b.x;
  const v1y = p.y - b.y;
  const v2x = p.x - c.x;
  const v2y = p.y - c.y;
  const t0 = clamp01(dot(v0x, v0y, e0x, e0y) / (len2(e0x, e0y) || 1));
  const t1 = clamp01(dot(v1x, v1y, e1x, e1y) / (len2(e1x, e1y) || 1));
  const t2 = clamp01(dot(v2x, v2y, e2x, e2y) / (len2(e2x, e2y) || 1));
  const d0 = Math.hypot(v0x - e0x * t0, v0y - e0y * t0);
  const d1 = Math.hypot(v1x - e1x * t1, v1y - e1y * t1);
  const d2 = Math.hypot(v2x - e2x * t2, v2y - e2y * t2);
  const min = Math.min(d0, d1, d2);
  const c0 = e0x * v0y - e0y * v0x;
  const c1 = e1x * v1y - e1y * v1x;
  const c2 = e2x * v2y - e2y * v2x;
  const inside = (c0 >= 0 && c1 >= 0 && c2 >= 0) || (c0 <= 0 && c1 <= 0 && c2 <= 0);
  return inside ? -min : min;
}

/** Isosceles triangle in local space: base centered at origin, apex at (0, height). */
export function sdIsoTriangle(p: Vec2, halfBase: number, height: number): number {
  return sdTriangle(p, { x: -halfBase, y: 0 }, { x: halfBase, y: 0 }, { x: 0, y: height });
}

/** Pie / sector in local space: aperture centered on +y. */
export function sdPie(p: Vec2, center: Vec2, radius: number, halfAngle: number): number {
  const q = { x: Math.abs(p.x - center.x), y: p.y - center.y };
  const scx = Math.sin(halfAngle);
  const scy = Math.cos(halfAngle);
  const l = length(q) - radius;
  const proj = clamp(dot(q.x, q.y, scx, scy), 0, radius);
  const m = length({ x: q.x - scx * proj, y: q.y - scy * proj });
  return Math.max(l, m * Math.sign(scy * q.x - scx * q.y));
}

export function opSmoothUnion(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / (k || 1);
  return Math.min(a, b) - h * h * k * 0.25;
}

export function opUnion(a: number, b: number): number {
  return Math.min(a, b);
}

export function coverage(dist: number, pixel = 1): number {
  const w = Math.max(pixel, 1e-4);
  const t = clamp(dist / w, -0.5, 0.5);
  return 1 - (t + 0.5);
}

/** Rotate p into the primitive's local frame (inverse rotation about its anchor). */
function toLocal(prim: Primitive, p: Vec2): Vec2 {
  const rot = prim.rot ?? 0;
  const dx = p.x - prim.ax;
  const dy = p.y - prim.ay;
  if (rot === 0) return { x: dx, y: dy };
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function primitiveSdf(prim: Primitive, p: Vec2): number {
  if (prim.kind === PRIM_DISK) return sdDisk(p, { x: prim.ax, y: prim.ay }, prim.r);
  if (prim.kind === PRIM_CAPSULE) return sdCapsule(p, { x: prim.ax, y: prim.ay }, { x: prim.bx, y: prim.by }, prim.r);
  if (prim.kind === PRIM_ROUNDED_BOX) {
    const q = toLocal(prim, p);
    return sdRoundedBox(q, { x: 0, y: 0 }, prim.bx, prim.by, Math.min(prim.r, prim.bx, prim.by));
  }
  if (prim.kind === PRIM_TRIANGLE) {
    const q = toLocal(prim, p);
    return sdIsoTriangle(q, prim.bx, prim.by) - prim.r;
  }
  if (prim.kind === PRIM_PIE) {
    const q = toLocal(prim, p);
    return sdPie(q, { x: 0, y: 0 }, prim.r, prim.bx);
  }
  return 1e9;
}

/** Conservative world-space bounds of a primitive (used to size instanced quads). */
export function primitiveBounds(prim: Primitive): { minX: number; minY: number; maxX: number; maxY: number } {
  if (prim.kind === PRIM_DISK) {
    return { minX: prim.ax - prim.r, minY: prim.ay - prim.r, maxX: prim.ax + prim.r, maxY: prim.ay + prim.r };
  }
  if (prim.kind === PRIM_CAPSULE) {
    return {
      minX: Math.min(prim.ax, prim.bx) - prim.r,
      minY: Math.min(prim.ay, prim.by) - prim.r,
      maxX: Math.max(prim.ax, prim.bx) + prim.r,
      maxY: Math.max(prim.ay, prim.by) + prim.r,
    };
  }
  let reach: number;
  if (prim.kind === PRIM_ROUNDED_BOX) reach = Math.hypot(prim.bx, prim.by);
  else if (prim.kind === PRIM_TRIANGLE) reach = Math.hypot(prim.bx, prim.by) + prim.r;
  else reach = prim.r;
  return { minX: prim.ax - reach, minY: prim.ay - reach, maxX: prim.ax + reach, maxY: prim.ay + reach };
}

/** Parse `#rgb`, `#rrggbb`, or `#rrggbbaa` into 0–1 floats. */
export function parseColor(hex: string): [number, number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (h.length < 6) return [1, 1, 1, 1];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

/** Compose a hex color with an alpha in 0–1. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseColor(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `#${byte(r)}${byte(g)}${byte(b)}${byte(a)}`;
}

/** Mix two hex colors (t = 0 → a, 1 → b). */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const k = Math.max(0, Math.min(1, t));
  return `#${byte(ca[0] + (cb[0] - ca[0]) * k)}${byte(ca[1] + (cb[1] - ca[1]) * k)}${byte(ca[2] + (cb[2] - ca[2]) * k)}`;
}

/** Lighten (t > 0) or darken (t < 0) a hex color. */
export function shade(hex: string, t: number): string {
  return t >= 0 ? mixColor(hex, '#ffffff', t) : mixColor(hex, '#000000', -t);
}

function byte(v: number): string {
  return Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}
function len2(x: number, y: number): number {
  return x * x + y * y;
}
