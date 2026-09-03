import { sdCapsule, sdDisk } from '../sdf/primitives';

/** CPU-callable SDF used by tests and as the GPU shader's reference. */
export function primitiveSdfGpu(
  kind: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  px: number,
  py: number,
): number {
  if (kind === 0) return sdDisk({ x: px, y: py }, { x: ax, y: ay }, r);
  if (kind === 1) return sdCapsule({ x: px, y: py }, { x: ax, y: ay }, { x: bx, y: by }, r);
  return 1e9;
}

export function coverageGpu(dist: number): number {
  return dist < 0 ? 1 : 0;
}
