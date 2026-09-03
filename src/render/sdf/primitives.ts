import type { Vec2 } from '../../core/math';
import { length, sub } from '../../core/math';

export const PRIM_DISK = 0;
export const PRIM_CAPSULE = 1;
export const PRIM_ROUNDED_BOX = 2;
export const PRIM_TRIANGLE = 3;
export const PRIM_PIE = 4;

export type Primitive = {
  kind: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
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
  const d0 = Math.hypot(v0x - e0x * clamp01(dot(v0x, v0y, e0x, e0y) / (len2(e0x, e0y) || 1)), v0y - e0y * clamp01(dot(v0x, v0y, e0x, e0y) / (len2(e0x, e0y) || 1)));
  const d1 = Math.hypot(v1x - e1x * clamp01(dot(v1x, v1y, e1x, e1y) / (len2(e1x, e1y) || 1)), v1y - e1y * clamp01(dot(v1x, v1y, e1x, e1y) / (len2(e1x, e1y) || 1)));
  const d2 = Math.hypot(v2x - e2x * clamp01(dot(v2x, v2y, e2x, e2y) / (len2(e2x, e2y) || 1)), v2y - e2y * clamp01(dot(v2x, v2y, e2x, e2y) / (len2(e2x, e2y) || 1)));
  const s = Math.sign(e0x * e0y !== 0 ? e0x * v0y - e0y * v0x : 1);
  const min = Math.min(d0, d1, d2);
  const inside =
    (e0x * v0y - e0y * v0x >= 0 && e1x * v1y - e1y * v1x >= 0 && e2x * v2y - e2y * v2x >= 0) ||
    (e0x * v0y - e0y * v0x <= 0 && e1x * v1y - e1y * v1x <= 0 && e2x * v2y - e2y * v2x <= 0);
  void s;
  return inside ? -min : min;
}

export function sdPie(p: Vec2, center: Vec2, radius: number, halfAngle: number): number {
  const q = { x: Math.abs(p.x - center.x), y: p.y - center.y };
  const scx = Math.sin(halfAngle);
  const scy = Math.cos(halfAngle);
  const l = length(q) - radius;
  const m = length({ x: q.x - scx * clamp(dot(q.x, q.y, scx, scy), 0, radius), y: q.y - scy * clamp(dot(q.x, q.y, scx, scy), 0, radius) });
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

export function primitiveSdf(prim: Primitive, p: Vec2): number {
  if (prim.kind === PRIM_DISK) return sdDisk(p, { x: prim.ax, y: prim.ay }, prim.r);
  if (prim.kind === PRIM_CAPSULE) return sdCapsule(p, { x: prim.ax, y: prim.ay }, { x: prim.bx, y: prim.by }, prim.r);
  if (prim.kind === PRIM_ROUNDED_BOX) return sdRoundedBox(p, { x: prim.ax, y: prim.ay }, prim.bx, prim.by, prim.r);
  if (prim.kind === PRIM_TRIANGLE)
    return sdTriangle(p, { x: prim.ax, y: prim.ay }, { x: prim.bx, y: prim.by }, { x: prim.ax + prim.r, y: prim.ay + prim.r });
  if (prim.kind === PRIM_PIE) return sdPie(p, { x: prim.ax, y: prim.ay }, prim.r, prim.bx);
  return 1e9;
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
