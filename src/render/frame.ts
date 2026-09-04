import type { PersistentDecalLayer } from './fx/decals';
import type { ParticleSystem } from './fx/particles';
import type { LightEmitter } from './gpu/lighting';
import { primitiveBoundsInto, type Bounds, type Primitive } from './sdf/primitives';

export type BlendOp = 'union' | 'smoothUnion';

/**
 * A group is one instanced quad: 1–16 primitives sharing a color, blend and layer.
 * `style` picks the fragment look: `shaded` (default: soft inner shade + faint rim),
 * `flat` (pure fill, for UI-ish marks and eyes), `outline` (rim only).
 * `fx` adds a per-group distortion / emissive effect.
 */
export type ShapeGroup = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  color: string;
  blend: BlendOp;
  smoothK: number;
  layer: number;
  primitives: Primitive[];
  fx?: 'none' | 'lava' | 'hole' | 'glow';
  style?: 'shaded' | 'flat' | 'outline';
  /**
   * Reach of the emissive halo in metres for `glow` / `lava` groups. The halo fades to zero at
   * exactly this distance and the group's quad is grown to contain it, so it is never cropped.
   */
  glow?: number;
};

/** Default halo reach for glowing groups that do not pick their own. */
export const DEFAULT_GLOW = 0.35;

/** Render layers, back to front. */
export const Layer = {
  Backdrop: 0,
  Decor: 1,
  Solids: 2,
  Hazards: 3,
  Props: 4,
  Weapons: 5,
  Ragdolls: 6,
  Players: 7,
  Projectiles: 8,
  Particles: 9,
  Overlay: 10,
} as const;

export type RenderFrame = {
  groups: ShapeGroup[];
  camera: { x: number; y: number; zoom: number; ppm: number; shakeX: number; shakeY: number };
  theme: { top: string; bottom: string; solid: string; vignette?: number };
  debug?: {
    bodies: { x: number; y: number; angle: number; hx: number; hy: number }[];
    rays: { x1: number; y1: number; x2: number; y2: number }[];
  };
  lights?: LightEmitter[];
  /** Persistent world-space decal texture; sampled, never rebuilt as groups. */
  decalLayer?: PersistentDecalLayer;
  /**
   * Live particles, drawn at {@link Layer.Particles} straight from the pool: one flat disk or
   * velocity-stretched capsule each, no group objects (see `particleQuad`).
   */
  particles?: ParticleSystem | null;
  hud: {
    slowmo: boolean;
    countdown: number;
    notice?: string;
    wins?: number[];
    firstTo?: number;
    showWins?: boolean;
    phase?: number;
    tick?: number;
    hash?: string;
    physicsMs?: number;
    gpuMs?: number;
    entities?: number;
    flash?: number;
    /** Seated players this round, with their palette color and alive flag. */
    players?: { slot: number; color: string; alive: boolean; crown: boolean; hp: number; maxHp: number }[];
    /** Slot of the round winner while the scoreboard shows, or -1 for a draw. */
    roundWinner?: number;
    matchWinner?: number;
    levelName?: string;
    /** Countdown progress 0–1 inside the current second (for the pop animation). */
    countdownT?: number;
  };
};

export function emptyFrame(): RenderFrame {
  return {
    groups: [],
    camera: { x: 16, y: 9, zoom: 1, ppm: 40, shakeX: 0, shakeY: 0 },
    theme: { top: '#333', bottom: '#111', solid: '#666' },
    hud: { slowmo: false, countdown: 0 },
  };
}

const boundsScratch: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Padded bounds of the primitives written into `out` (returned); an empty list gives a zero box. */
export function groupBoundsInto(primitives: Primitive[], pad: number, out: Bounds): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < primitives.length; i++) {
    const b = primitiveBoundsInto(primitives[i]!, boundsScratch);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) {
    out.minX = out.minY = out.maxX = out.maxY = 0;
    return out;
  }
  out.minX = minX - pad;
  out.minY = minY - pad;
  out.maxX = maxX + pad;
  out.maxY = maxY + pad;
  return out;
}

export function groupBounds(primitives: Primitive[], pad = 0.4): Bounds {
  return groupBoundsInto(primitives, pad, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
}

/**
 * Convenience constructor: bounds are derived from the primitives. Glowing groups always get a
 * quad at least as wide as their halo (`glow`, metres) so the gradient is never clipped.
 */
export function group(
  primitives: Primitive[],
  color: string,
  layer: number,
  opts: { blend?: BlendOp; smoothK?: number; fx?: ShapeGroup['fx']; style?: ShapeGroup['style']; pad?: number; glow?: number } = {},
): ShapeGroup {
  const emissive = opts.fx === 'glow' || opts.fx === 'lava';
  const glow = emissive ? opts.glow ?? DEFAULT_GLOW : 0;
  const pad = Math.max(opts.pad ?? 0.25, glow + 0.05);
  // Built as one literal (bounds included) so every group shares a single hidden class and the
  // packer's field reads stay monomorphic; no spread, no intermediate bounds object.
  const g: ShapeGroup = {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    color,
    blend: opts.blend ?? 'union',
    smoothK: opts.smoothK ?? 0,
    layer,
    primitives,
    fx: opts.fx,
    style: opts.style,
    glow: emissive ? glow : undefined,
  };
  groupBoundsInto(primitives, pad, g);
  return g;
}
