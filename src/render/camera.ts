import { clamp, lerp } from '../core/math';
import { tuning } from '../sim/tuning';

export type CameraState = {
  x: number;
  y: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
  shake: number;
};

export function createCamera(bounds: { x: number; y: number; w: number; h: number }): CameraState {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, zoom: 1, shakeX: 0, shakeY: 0, shake: 0 };
}

export function updateCamera(
  cam: CameraState,
  targets: { x: number; y: number }[],
  bounds: { x: number; y: number; w: number; h: number },
  viewW: number,
  viewH: number,
): CameraState {
  const pts = targets.length ? targets : [{ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = tuning.cameraPadding;
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = Math.max(maxX - minX, 8);
  const spanY = Math.max(maxY - minY, 6);
  const ppmFit = Math.min(viewW / spanX, viewH / spanY);
  const ppmArena = Math.min(viewW / bounds.w, viewH / bounds.h);
  // PLAN 4.11 / Appendix A: never zoom out past the whole-arena view.
  const zoom = Math.max(ppmArena, Math.min(ppmFit, ppmArena * 1.8));
  cam.x = lerp(cam.x, cx, tuning.cameraLerp);
  cam.y = lerp(cam.y, cy, tuning.cameraLerp);
  cam.zoom = lerp(cam.zoom, zoom, tuning.cameraZoomLerp);
  const halfW = viewW / (2 * Math.max(cam.zoom, 1e-6));
  const halfH = viewH / (2 * Math.max(cam.zoom, 1e-6));
  const viewMinX = bounds.x + halfW;
  const viewMaxX = bounds.x + bounds.w - halfW;
  const viewMinY = bounds.y + halfH;
  const viewMaxY = bounds.y + bounds.h - halfH;
  if (viewMinX <= viewMaxX) cam.x = clamp(cam.x, viewMinX, viewMaxX);
  if (viewMinY <= viewMaxY) cam.y = clamp(cam.y, viewMinY, viewMaxY);
  cam.shake *= 0.85;
  cam.shakeX = (Math.random() - 0.5) * cam.shake;
  cam.shakeY = (Math.random() - 0.5) * cam.shake;
  return cam;
}

export function addShake(cam: CameraState, amount: number): void {
  cam.shake = Math.min(24, cam.shake + amount);
}

/** PLAN 4.11 black-hole UV: pull sample points toward the attractor. */
export function warpWorld(
  x: number,
  y: number,
  hole?: { x: number; y: number; r: number },
): { x: number; y: number } {
  if (!hole || hole.r <= 0.05) return { x, y };
  const dx = x - hole.x;
  const dy = y - hole.y;
  const dist = Math.hypot(dx, dy);
  const fall = Math.max(0, 1 - dist / hole.r);
  const k = 0.35 * fall * fall;
  return { x: x - dx * k, y: y - dy * k };
}

export function worldToScreen(
  cam: CameraState,
  x: number,
  y: number,
  viewW: number,
  viewH: number,
  hole?: { x: number; y: number; r: number },
): { x: number; y: number } {
  const w = warpWorld(x, y, hole);
  const ppm = cam.zoom;
  return {
    x: (w.x - cam.x) * ppm + viewW / 2 + cam.shakeX,
    y: viewH / 2 - (w.y - cam.y) * ppm + cam.shakeY,
  };
}
