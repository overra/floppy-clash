import { lerp } from '../core/math';
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
  const zoom = Math.min(ppmFit, ppmArena * 1.8);
  cam.x = lerp(cam.x, cx, tuning.cameraLerp);
  cam.y = lerp(cam.y, cy, tuning.cameraLerp);
  cam.zoom = lerp(cam.zoom, zoom, tuning.cameraZoomLerp);
  cam.shake *= 0.85;
  cam.shakeX = (Math.random() - 0.5) * cam.shake;
  cam.shakeY = (Math.random() - 0.5) * cam.shake;
  return cam;
}

export function addShake(cam: CameraState, amount: number): void {
  cam.shake = Math.min(24, cam.shake + amount);
}

export function worldToScreen(
  cam: CameraState,
  x: number,
  y: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const ppm = cam.zoom;
  return {
    x: (x - cam.x) * ppm + viewW / 2 + cam.shakeX,
    y: viewH / 2 - (y - cam.y) * ppm + cam.shakeY,
  };
}
