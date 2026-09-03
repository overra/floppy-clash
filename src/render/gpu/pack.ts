import type { ShapeGroup } from '../frame';
import { GROUP_STRIDE, PRIM_STRIDE } from './shaders';

/** Pack RenderFrame groups into GPU storage-buffer layouts (CPU-testable). */
export function packGroups(groups: ShapeGroup[]): {
  groupBytes: ArrayBuffer;
  primBytes: ArrayBuffer;
  groupCount: number;
  primCount: number;
  layer0Count: number;
} {
  const ordered = [...groups].sort((a, b) => a.layer - b.layer);
  let primCount = 0;
  for (const g of ordered) primCount += g.primitives.length;
  const groupBytes = new ArrayBuffer(Math.max(256, ordered.length * GROUP_STRIDE));
  const primBytes = new ArrayBuffer(Math.max(256, primCount * PRIM_STRIDE));
  const gv = new DataView(groupBytes);
  const pv = new DataView(primBytes);
  let po = 0;
  let pi = 0;
  ordered.forEach((g, i) => {
    const off = i * GROUP_STRIDE;
    gv.setFloat32(off, g.minX, true);
    gv.setFloat32(off + 4, g.minY, true);
    gv.setFloat32(off + 8, g.maxX, true);
    gv.setFloat32(off + 12, g.maxY, true);
    const c = parseHex(g.color);
    gv.setFloat32(off + 16, c[0], true);
    gv.setFloat32(off + 20, c[1], true);
    gv.setFloat32(off + 24, c[2], true);
    gv.setFloat32(off + 28, 1, true);
    gv.setUint32(off + 32, pi, true);
    gv.setUint32(off + 36, g.primitives.length, true);
    gv.setUint32(off + 40, g.blend === 'smoothUnion' ? 1 : g.blend === 'subtract' ? 2 : 0, true);
    gv.setFloat32(off + 44, g.smoothK, true);
    gv.setUint32(off + 48, g.fx === 'lava' ? 1 : g.fx === 'hole' ? 2 : 0, true);
    for (const p of g.primitives) {
      pv.setUint32(po, p.kind, true);
      pv.setFloat32(po + 4, p.ax, true);
      pv.setFloat32(po + 8, p.ay, true);
      pv.setFloat32(po + 12, p.bx, true);
      pv.setFloat32(po + 16, p.by, true);
      pv.setFloat32(po + 20, p.r, true);
      pv.setFloat32(po + 24, p.cx ?? 0, true);
      pv.setFloat32(po + 28, p.cy ?? 0, true);
      po += PRIM_STRIDE;
      pi += 1;
    }
  });
  return {
    groupBytes,
    primBytes,
    groupCount: ordered.length,
    primCount,
    layer0Count: ordered.filter((g) => g.layer <= 0).length,
  };
}

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length < 6) return [1, 1, 1];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
