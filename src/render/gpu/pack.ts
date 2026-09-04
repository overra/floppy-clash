import { Layer, type ShapeGroup } from '../frame';
import { PARTICLE_RGBA, emptyParticleQuad, particleQuad, type ParticleSystem } from '../fx/particles';
import { parseColor } from '../sdf/primitives';

export const GROUP_STRIDE = 64;
export const PRIM_STRIDE = 32;

/** Colour as packed for the GPU (0–1 floats). `parseColor` memoises, so this is a lookup per group. */
export const packedColor = parseColor;

/**
 * Scratch memory the packer writes into. It only ever grows, so a steady frame allocates nothing;
 * the renderer uploads straight out of it (see {@link packInto}).
 */
const scratch = {
  groupF32: new Float32Array(1024 * (GROUP_STRIDE / 4)),
  groupU32: new Uint32Array(0),
  primF32: new Float32Array(4096 * (PRIM_STRIDE / 4)),
  primU32: new Uint32Array(0),
};
scratch.groupU32 = new Uint32Array(scratch.groupF32.buffer);
scratch.primU32 = new Uint32Array(scratch.primF32.buffer);

function ensure(groupBytes: number, primBytes: number): void {
  if (groupBytes > scratch.groupF32.byteLength) {
    scratch.groupF32 = new Float32Array(Math.max(groupBytes, scratch.groupF32.byteLength * 2) / 4);
    scratch.groupU32 = new Uint32Array(scratch.groupF32.buffer);
  }
  if (primBytes > scratch.primF32.byteLength) {
    scratch.primF32 = new Float32Array(Math.max(primBytes, scratch.primF32.byteLength * 2) / 4);
    scratch.primU32 = new Uint32Array(scratch.primF32.buffer);
  }
}

export type PackedInto = {
  /** The scratch buffers; upload the first `groupBytes` / `primBytes` bytes of each. */
  groups: ArrayBuffer;
  prims: ArrayBuffer;
  groupBytes: number;
  primBytes: number;
  groupCount: number;
  primCount: number;
};

const quad = emptyParticleQuad();

/**
 * Packs groups (and, in layer order, the frame's particles) into the shared scratch buffers without
 * allocating. `maxGroups` / `maxPrims` cap what is packed: whole groups are dropped from the end, so a
 * group's primitives are never split, and particles beyond the cap are dropped before any group is.
 *
 * Groups arrive sorted by layer. Particles are written as one single-primitive instance each between
 * the last group at or below {@link Layer.Particles} and the first one above it, so instance order
 * (which is draw order) matches the layer order the group path produces.
 */
export function packInto(groups: ShapeGroup[], maxGroups = Infinity, maxPrims = Infinity, particles?: ParticleSystem | null): PackedInto {
  let n = Math.min(groups.length, maxGroups);
  let primCount = 0;
  for (let i = 0; i < n; i++) primCount += groups[i]!.primitives.length;
  while (n > 0 && primCount > maxPrims) {
    n -= 1;
    primCount -= groups[n]!.primitives.length;
  }
  const parts = particles && n === groups.length ? Math.min(particles.count, maxGroups - n, maxPrims - primCount) : 0;
  const total = n + parts;
  ensure(total * GROUP_STRIDE, (primCount + parts) * PRIM_STRIDE);
  const gf = scratch.groupF32;
  const gu = scratch.groupU32;
  const pf = scratch.primF32;
  const pu = scratch.primU32;
  let po = 0;
  let pi = 0;
  let gi = 0;
  let particlesDone = parts === 0;
  for (let i = 0; i < n; i++) {
    const g = groups[i]!;
    if (!particlesDone && g.layer > Layer.Particles) {
      writeParticles();
      particlesDone = true;
    }
    const off = gi * (GROUP_STRIDE / 4);
    gi += 1;
    gf[off] = g.minX;
    gf[off + 1] = g.minY;
    gf[off + 2] = g.maxX;
    gf[off + 3] = g.maxY;
    const c = packedColor(g.color);
    gf[off + 4] = c[0];
    gf[off + 5] = c[1];
    gf[off + 6] = c[2];
    gf[off + 7] = c[3];
    gu[off + 8] = pi;
    gu[off + 9] = g.primitives.length;
    gu[off + 10] = g.blend === 'smoothUnion' ? 1 : 0;
    gf[off + 11] = g.smoothK;
    gu[off + 12] = fxCode(g.fx);
    gu[off + 13] = styleCode(g.style);
    gf[off + 14] = g.glow ?? 0;
    gf[off + 15] = 0;
    const prims = g.primitives;
    for (let k = 0; k < prims.length; k++) {
      const p = prims[k]!;
      pu[po] = p.kind;
      pf[po + 1] = p.ax;
      pf[po + 2] = p.ay;
      pf[po + 3] = p.bx;
      pf[po + 4] = p.by;
      pf[po + 5] = p.r;
      pf[po + 6] = p.rot ?? 0;
      pf[po + 7] = 0;
      po += PRIM_STRIDE / 4;
      pi += 1;
    }
  }
  if (!particlesDone) writeParticles();

  function writeParticles(): void {
    const sys = particles!;
    for (let k = 0; k < parts; k++) {
      const q = particleQuad(sys, k, quad);
      const rgba = PARTICLE_RGBA[q.color] ?? PARTICLE_RGBA[0]!;
      const off = gi * (GROUP_STRIDE / 4);
      gi += 1;
      gf[off] = q.minX;
      gf[off + 1] = q.minY;
      gf[off + 2] = q.maxX;
      gf[off + 3] = q.maxY;
      gf[off + 4] = rgba[0];
      gf[off + 5] = rgba[1];
      gf[off + 6] = rgba[2];
      gf[off + 7] = rgba[3] * q.alpha;
      gu[off + 8] = pi;
      gu[off + 9] = 1;
      gu[off + 10] = 0;
      gf[off + 11] = 0;
      gu[off + 12] = q.glow > 0 ? FX_GLOW : 0;
      gu[off + 13] = STYLE_FLAT;
      gf[off + 14] = q.glow;
      gf[off + 15] = 0;
      pu[po] = q.kind;
      pf[po + 1] = q.ax;
      pf[po + 2] = q.ay;
      pf[po + 3] = q.bx;
      pf[po + 4] = q.by;
      pf[po + 5] = q.r;
      pf[po + 6] = 0;
      pf[po + 7] = 0;
      po += PRIM_STRIDE / 4;
      pi += 1;
    }
  }

  return {
    groups: scratch.groupF32.buffer as ArrayBuffer,
    prims: scratch.primF32.buffer as ArrayBuffer,
    groupBytes: total * GROUP_STRIDE,
    primBytes: (primCount + parts) * PRIM_STRIDE,
    groupCount: total,
    primCount: primCount + parts,
  };
}

const FX_GLOW = 3;
const STYLE_FLAT = 1;

/** Pack RenderFrame groups into fresh GPU storage-buffer layouts (CPU-testable copy of the scratch). */
export function packGroups(
  groups: ShapeGroup[],
  particles?: ParticleSystem | null,
): {
  groupBytes: ArrayBuffer;
  primBytes: ArrayBuffer;
  groupCount: number;
  primCount: number;
} {
  const packed = packInto(groups, Infinity, Infinity, particles);
  return {
    groupBytes: packed.groups.slice(0, Math.max(256, packed.groupBytes)),
    primBytes: packed.prims.slice(0, Math.max(256, packed.primBytes)),
    groupCount: packed.groupCount,
    primCount: packed.primCount,
  };
}

export function fxCode(fx: ShapeGroup['fx']): number {
  switch (fx) {
    case 'lava':
      return 1;
    case 'hole':
      return 2;
    case 'glow':
      return 3;
    default:
      return 0;
  }
}

export function styleCode(style: ShapeGroup['style']): number {
  switch (style) {
    case 'flat':
      return 1;
    case 'outline':
      return 2;
    default:
      return 0;
  }
}

export function parseHex(hex: string): [number, number, number] {
  const [r, g, b] = parseColor(hex);
  return [r, g, b];
}
