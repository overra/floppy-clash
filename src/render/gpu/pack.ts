import type { ShapeGroup } from '../frame';
import { parseColor } from '../sdf/primitives';

export const GROUP_STRIDE = 64;
export const PRIM_STRIDE = 32;

/** Pack RenderFrame groups into GPU storage-buffer layouts (CPU-testable). */
export function packGroups(groups: ShapeGroup[]): {
  groupBytes: ArrayBuffer;
  primBytes: ArrayBuffer;
  groupCount: number;
  primCount: number;
} {
  let primCount = 0;
  for (const g of groups) primCount += g.primitives.length;
  const groupBytes = new ArrayBuffer(Math.max(256, groups.length * GROUP_STRIDE));
  const primBytes = new ArrayBuffer(Math.max(256, primCount * PRIM_STRIDE));
  const gv = new DataView(groupBytes);
  const pv = new DataView(primBytes);
  let po = 0;
  let pi = 0;
  groups.forEach((g, i) => {
    const off = i * GROUP_STRIDE;
    gv.setFloat32(off, g.minX, true);
    gv.setFloat32(off + 4, g.minY, true);
    gv.setFloat32(off + 8, g.maxX, true);
    gv.setFloat32(off + 12, g.maxY, true);
    const c = parseColor(g.color);
    gv.setFloat32(off + 16, c[0], true);
    gv.setFloat32(off + 20, c[1], true);
    gv.setFloat32(off + 24, c[2], true);
    gv.setFloat32(off + 28, c[3], true);
    gv.setUint32(off + 32, pi, true);
    gv.setUint32(off + 36, g.primitives.length, true);
    gv.setUint32(off + 40, g.blend === 'smoothUnion' ? 1 : 0, true);
    gv.setFloat32(off + 44, g.smoothK, true);
    gv.setUint32(off + 48, fxCode(g.fx), true);
    gv.setUint32(off + 52, styleCode(g.style), true);
    gv.setFloat32(off + 56, g.glow ?? 0, true);
    for (const p of g.primitives) {
      pv.setUint32(po, p.kind, true);
      pv.setFloat32(po + 4, p.ax, true);
      pv.setFloat32(po + 8, p.ay, true);
      pv.setFloat32(po + 12, p.bx, true);
      pv.setFloat32(po + 16, p.by, true);
      pv.setFloat32(po + 20, p.r, true);
      pv.setFloat32(po + 24, p.rot ?? 0, true);
      po += PRIM_STRIDE;
      pi += 1;
    }
  });
  return { groupBytes, primBytes, groupCount: groups.length, primCount };
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
