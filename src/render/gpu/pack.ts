import type { ShapeGroup } from '../frame';

/** Pack RenderFrame groups into GPU storage-buffer layouts (CPU-testable). */
export function packGroups(groups: ShapeGroup[]): {
  groupBytes: ArrayBuffer;
  primBytes: ArrayBuffer;
  groupCount: number;
  primCount: number;
} {
  let primCount = 0;
  for (const g of groups) primCount += g.primitives.length;
  const groupBytes = new ArrayBuffer(Math.max(256, groups.length * 64));
  const primBytes = new ArrayBuffer(Math.max(256, primCount * 32));
  const gv = new DataView(groupBytes);
  const pv = new DataView(primBytes);
  let po = 0;
  let pi = 0;
  groups.forEach((g, i) => {
    const off = i * 64;
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
    gv.setUint32(off + 40, g.blend === 'smoothUnion' ? 1 : 0, true);
    gv.setFloat32(off + 44, g.smoothK, true);
    for (const p of g.primitives) {
      pv.setUint32(po, p.kind, true);
      pv.setFloat32(po + 4, p.ax, true);
      pv.setFloat32(po + 8, p.ay, true);
      pv.setFloat32(po + 12, p.bx, true);
      pv.setFloat32(po + 16, p.by, true);
      pv.setFloat32(po + 20, p.r, true);
      po += 32;
      pi += 1;
    }
  });
  return { groupBytes, primBytes, groupCount: groups.length, primCount };
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
