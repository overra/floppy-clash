export type Vec2 = { x: number; y: number };

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function lengthSq(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  if (len <= 1e-8) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clampAbs(v: number, max: number): number {
  return clamp(v, -max, max);
}

export function sign(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function angleOf(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

export function fromAngle(rad: number, mag = 1): Vec2 {
  return { x: Math.cos(rad) * mag, y: Math.sin(rad) * mag };
}

export function rotate(a: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isFiniteVec(a: Vec2): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y);
}

export function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
}
