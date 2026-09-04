import type { LevelDef } from '../sim/level/schema';
import type { ThemePalette } from '../sim/level/themes';
import { Layer, group, type ShapeGroup } from './frame';
import { PRIM_CAPSULE, PRIM_DISK, PRIM_ROUNDED_BOX, PRIM_TRIANGLE, type Primitive, withAlpha } from './sdf/primitives';

/**
 * Backdrop decorations: themed silhouettes behind the arena with parallax.
 * Levels may author `decor`; otherwise a deterministic set is generated from the level id so
 * every arena has a backdrop without touching level data.
 */
export type DecorItem = { kind: string; x: number; y: number; scale: number; depth: number; seed: number };

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const cache = new Map<string, DecorItem[]>();

export function decorForLevel(level: LevelDef, theme: ThemePalette): DecorItem[] {
  const key = `${level.id}:${theme.id}:${level.decor?.length ?? 0}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const items: DecorItem[] = [];
  const b = level.bounds;
  const authored = level.decor ?? [];
  authored.forEach((d, i) => items.push({ kind: d.kind, x: d.x, y: d.y, scale: d.scale ?? 1, depth: 0.55, seed: i * 7919 }));
  const next = rng(hashStr(level.id));
  const kinds = theme.decorKinds;
  const floor = b.y + 0.5;
  // Far band: big soft shapes low on the horizon.
  const farCount = 4 + Math.floor(next() * 3);
  for (let i = 0; i < farCount; i++) {
    const kind = pickFar(kinds);
    if (!kind) break;
    items.push({
      kind,
      x: b.x - 4 + next() * (b.w + 8),
      y: floor - 1,
      scale: 1.6 + next() * 2.2,
      depth: 0.3,
      seed: Math.floor(next() * 1e6),
    });
  }
  // Near band: medium silhouettes spread across the width.
  const nearCount = 5 + Math.floor(next() * 4);
  for (let i = 0; i < nearCount; i++) {
    const kind = pickNear(kinds, next);
    if (!kind) break;
    items.push({
      kind,
      x: b.x - 2 + next() * (b.w + 4),
      y: floor,
      scale: 0.9 + next() * 1.1,
      depth: 0.55,
      seed: Math.floor(next() * 1e6),
    });
  }
  // Sky objects.
  for (const kind of kinds) {
    if (kind === 'moon' || kind === 'sun') {
      items.push({ kind, x: b.x + b.w * (0.15 + next() * 0.7), y: b.y + b.h * 0.8, scale: 1 + next() * 0.6, depth: 0.15, seed: 1 });
    }
    if (kind === 'star') {
      for (let i = 0; i < 26; i++) {
        items.push({ kind, x: b.x - 4 + next() * (b.w + 8), y: b.y + b.h * (0.35 + next() * 0.7), scale: 0.4 + next() * 0.8, depth: 0.1, seed: i });
      }
    }
    if (kind === 'cloud') {
      for (let i = 0; i < 4; i++) {
        items.push({ kind, x: b.x - 4 + next() * (b.w + 8), y: b.y + b.h * (0.55 + next() * 0.4), scale: 1 + next() * 1.4, depth: 0.2, seed: i });
      }
    }
    if (kind === 'bat') {
      for (let i = 0; i < 5; i++) {
        items.push({ kind, x: b.x + next() * b.w, y: b.y + b.h * (0.5 + next() * 0.4), scale: 0.5 + next() * 0.5, depth: 0.45, seed: i });
      }
    }
    if (kind === 'ember') {
      for (let i = 0; i < 18; i++) {
        items.push({ kind, x: b.x + next() * b.w, y: b.y + next() * b.h, scale: 0.4 + next() * 0.8, depth: 0.5, seed: i });
      }
    }
    if (kind === 'snow') {
      for (let i = 0; i < 40; i++) {
        items.push({ kind, x: b.x - 4 + next() * (b.w + 8), y: b.y + next() * b.h, scale: 0.6 + next() * 0.8, depth: 0.6, seed: i });
      }
    }
    if (kind === 'grid') {
      items.push({ kind, x: b.x + b.w / 2, y: b.y + b.h / 2, scale: Math.max(b.w, b.h), depth: 0.4, seed: 0 });
    }
  }
  cache.set(key, items);
  return items;
}

function pickFar(kinds: string[]): string | undefined {
  for (const k of ['hill', 'dune', 'mesa', 'stack', 'tower', 'stalagmite']) if (kinds.includes(k)) return k;
  return undefined;
}
function pickNear(kinds: string[], next: () => number): string | undefined {
  const near = kinds.filter((k) => ['pine', 'tree', 'bush', 'cactus', 'gear', 'pipe', 'tower', 'grave', 'stalagmite', 'stack'].includes(k));
  if (!near.length) return undefined;
  return near[Math.floor(next() * near.length)];
}

/** Build backdrop groups for one frame, with parallax relative to the level center. */
export function decorGroups(
  items: DecorItem[],
  theme: ThemePalette,
  cam: { x: number; y: number },
  center: { x: number; y: number },
  time: number,
): ShapeGroup[] {
  const out: ShapeGroup[] = [];
  for (const d of items) {
    const px = d.x + (cam.x - center.x) * (1 - d.depth) * 0.6;
    const py = d.y + (cam.y - center.y) * (1 - d.depth) * 0.35;
    const color = d.depth < 0.45 ? theme.decorFar : theme.decor;
    const shapes = decorShapes(d.kind, px, py, d.scale, d.seed, time, theme, color);
    for (const g of shapes) out.push(g);
  }
  return out;
}

function disk(cx: number, cy: number, r: number): Primitive {
  return { kind: PRIM_DISK, ax: cx, ay: cy, bx: cx, by: cy, r };
}
function cap(ax: number, ay: number, bx: number, by: number, r: number): Primitive {
  return { kind: PRIM_CAPSULE, ax, ay, bx, by, r };
}
function rbox(cx: number, cy: number, hx: number, hy: number, r = 0.05, rot = 0): Primitive {
  return { kind: PRIM_ROUNDED_BOX, ax: cx, ay: cy, bx: hx, by: hy, r, rot };
}
function tri(cx: number, cy: number, halfBase: number, height: number, rot = 0, r = 0.04): Primitive {
  return { kind: PRIM_TRIANGLE, ax: cx, ay: cy, bx: halfBase, by: height, r, rot };
}

function decorShapes(kind: string, x: number, y: number, s: number, seed: number, time: number, theme: ThemePalette, color: string): ShapeGroup[] {
  const L = Layer.Decor;
  switch (kind) {
    case 'tree': {
      const trunk = cap(x, y, x, y + 1.6 * s, 0.14 * s);
      const crown = [disk(x, y + 2.3 * s, 0.9 * s), disk(x - 0.6 * s, y + 1.9 * s, 0.65 * s), disk(x + 0.6 * s, y + 1.95 * s, 0.6 * s), disk(x, y + 2.9 * s, 0.55 * s)];
      return [group([trunk, ...crown], color, L, { blend: 'smoothUnion', smoothK: 0.3 * s, style: 'flat' })];
    }
    case 'pine': {
      const trunk = cap(x, y, x, y + 0.9 * s, 0.12 * s);
      const tiers = [tri(x, y + 0.6 * s, 1.1 * s, 1.6 * s), tri(x, y + 1.5 * s, 0.85 * s, 1.4 * s), tri(x, y + 2.3 * s, 0.6 * s, 1.2 * s)];
      return [group([trunk, ...tiers], color, L, { style: 'flat' })];
    }
    case 'bush':
      return [group([disk(x, y + 0.35 * s, 0.5 * s), disk(x - 0.45 * s, y + 0.25 * s, 0.35 * s), disk(x + 0.45 * s, y + 0.28 * s, 0.38 * s)], color, L, { blend: 'smoothUnion', smoothK: 0.25 * s, style: 'flat' })];
    case 'hill':
      return [group([disk(x, y - 2.2 * s, 3.4 * s), disk(x + 2.5 * s, y - 2.6 * s, 3 * s)], color, L, { blend: 'smoothUnion', smoothK: 1.2 * s, style: 'flat' })];
    case 'dune':
      return [group([disk(x, y - 3 * s, 4.2 * s), disk(x + 3.5 * s, y - 3.4 * s, 3.6 * s)], color, L, { blend: 'smoothUnion', smoothK: 2 * s, style: 'flat' })];
    case 'mesa':
      return [group([rbox(x, y + 1.2 * s, 1.6 * s, 1.3 * s, 0.25 * s), rbox(x, y + 2.7 * s, 1.1 * s, 0.35 * s, 0.15 * s), rbox(x - 2.4 * s, y + 0.7 * s, 1 * s, 0.8 * s, 0.2 * s)], color, L, { style: 'flat' })];
    case 'cactus':
      return [
        group(
          [cap(x, y, x, y + 1.7 * s, 0.17 * s), cap(x - 0.05 * s, y + 0.9 * s, x - 0.5 * s, y + 0.95 * s, 0.11 * s), cap(x - 0.5 * s, y + 0.95 * s, x - 0.5 * s, y + 1.35 * s, 0.11 * s), cap(x + 0.05 * s, y + 0.6 * s, x + 0.45 * s, y + 0.65 * s, 0.11 * s), cap(x + 0.45 * s, y + 0.65 * s, x + 0.45 * s, y + 1.1 * s, 0.11 * s)],
          color,
          L,
          { blend: 'smoothUnion', smoothK: 0.1 * s, style: 'flat' },
        ),
      ];
    case 'gear': {
      const r = 1.1 * s;
      const spin = time * (seed % 2 ? 0.4 : -0.3) + seed;
      const teeth: Primitive[] = [];
      for (let i = 0; i < 8; i++) {
        const a = spin + (i / 8) * Math.PI * 2;
        teeth.push(rbox(x + Math.cos(a) * r, y + 2 * s + Math.sin(a) * r, 0.22 * s, 0.32 * s, 0.05, a - Math.PI / 2));
      }
      return [group([disk(x, y + 2 * s, r), ...teeth], color, L, { style: 'flat' }), group([disk(x, y + 2 * s, r * 0.32)], theme.decorFar, L, { style: 'flat' })];
    }
    case 'stack':
      return [group([rbox(x, y + 2.6 * s, 0.5 * s, 2.8 * s, 0.1), rbox(x, y + 5.4 * s, 0.65 * s, 0.25 * s, 0.08)], color, L, { style: 'flat' }), group([disk(x + 0.3 * s + Math.sin(time * 0.7 + seed) * 0.3, y + 6.4 * s, 0.55 * s), disk(x + 0.9 * s + Math.sin(time * 0.5 + seed) * 0.4, y + 7.2 * s, 0.75 * s)], withAlpha(theme.decorFar, 0.6), L, { blend: 'smoothUnion', smoothK: 0.5, style: 'flat' })];
    case 'pipe':
      return [group([cap(x - 2 * s, y + 1.2 * s, x + 2 * s, y + 1.2 * s, 0.22 * s), cap(x + 2 * s, y + 1.2 * s, x + 2 * s, y + 3 * s, 0.22 * s), disk(x + 2 * s, y + 1.2 * s, 0.34 * s)], color, L, { style: 'flat' })];
    case 'tower': {
      const crenels: Primitive[] = [];
      for (let i = -1; i <= 1; i++) crenels.push(rbox(x + i * 0.55 * s, y + 3.75 * s, 0.2 * s, 0.25 * s, 0.03));
      return [group([rbox(x, y + 1.8 * s, 0.8 * s, 1.9 * s, 0.08), ...crenels], color, L, { style: 'flat' })];
    }
    case 'moon':
      return [group([disk(x, y, 1.1 * s)], withAlpha('#fff6d8', 0.85), L, { style: 'flat', fx: 'glow', glow: 1.4 * s })];
    case 'sun':
      return [group([disk(x, y, 1.3 * s)], withAlpha('#fff1b8', 0.9), L, { style: 'flat', fx: 'glow', glow: 1.8 * s })];
    case 'star':
      return [group([disk(x, y, 0.045 * s)], withAlpha('#dfe8ff', 0.5 + 0.5 * Math.abs(Math.sin(time * 1.3 + seed))), L, { style: 'flat' })];
    case 'cloud':
      return [group([disk(x, y, 0.7 * s), disk(x + 0.8 * s, y + 0.1 * s, 0.9 * s), disk(x + 1.7 * s, y, 0.65 * s), rbox(x + 0.8 * s, y - 0.3 * s, 1.5 * s, 0.35 * s, 0.3 * s)], withAlpha('#ffffff', 0.35), L, { blend: 'smoothUnion', smoothK: 0.4, style: 'flat' })];
    case 'bat': {
      const flap = Math.sin(time * 9 + seed) * 0.25;
      const bx = x + Math.sin(time * 0.6 + seed) * 2;
      const by = y + Math.cos(time * 0.8 + seed) * 0.6;
      return [group([disk(bx, by, 0.12 * s), tri(bx - 0.28 * s, by, 0.3 * s, 0.35 * s, Math.PI / 2 + flap), tri(bx + 0.28 * s, by, 0.3 * s, 0.35 * s, -Math.PI / 2 - flap)], '#0c0710', L, { style: 'flat' })];
    }
    case 'grave':
      return [group([rbox(x, y + 0.55 * s, 0.35 * s, 0.55 * s, 0.3 * s), rbox(x, y + 0.1 * s, 0.45 * s, 0.1 * s, 0.05)], color, L, { style: 'flat' })];
    case 'ember': {
      const t = (time * 0.35 + seed * 0.13) % 1;
      const ex = x + Math.sin(time * 0.9 + seed) * 0.6;
      const ey = y + t * 6 - 3;
      return [group([disk(ex, ey, 0.06 * s)], withAlpha('#ffb347', 0.6 * (1 - t)), L, { style: 'flat', fx: 'glow', glow: 0.25 })];
    }
    case 'stalagmite':
      return [group([tri(x, y - 0.2, 0.9 * s, 3.2 * s), tri(x + 1.3 * s, y - 0.2, 0.6 * s, 2.1 * s), tri(x - 1.1 * s, y - 0.2, 0.5 * s, 1.6 * s)], color, L, { style: 'flat' })];
    case 'snow': {
      const t = (time * 0.12 + seed * 0.07) % 1;
      const sx = x + Math.sin(time * 0.7 + seed) * 0.8;
      const sy = y + 6 - t * 14;
      return [group([disk(sx, sy, 0.07 * s)], withAlpha('#ffffff', 0.55), L, { style: 'flat' })];
    }
    case 'grid': {
      // One group per line: bundled, every pixel of the arena would evaluate all 26 lines, whereas a
      // line on its own only touches the thin strip it covers. Crossings blend twice, which reads as
      // a slightly brighter node and suits the look.
      const out: ShapeGroup[] = [];
      const half = s / 2;
      const color = withAlpha(theme.trim, 0.25);
      for (let i = -6; i <= 6; i++) {
        out.push(group([cap(x - half, y + i * 2, x + half, y + i * 2, 0.012)], color, L, { style: 'flat', pad: 0.05 }));
        out.push(group([cap(x + i * 2.5, y - half, x + i * 2.5, y + half, 0.012)], color, L, { style: 'flat', pad: 0.05 }));
      }
      return out;
    }
    default:
      return [group([cap(x, y, x, y + 1.6 * s, 0.12 * s)], color, L, { style: 'flat' })];
  }
}
