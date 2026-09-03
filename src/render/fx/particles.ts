import type { SimEvents } from '../../sim/events';
import { PRIM_CAPSULE, PRIM_DISK, parseColor } from '../sdf/primitives';

/*
 * Particles live in a struct-of-arrays pool rather than as one object each. A fight throws off
 * hundreds of them per second and each one lives long enough (0.1–1.2 s) to be promoted out of the
 * young generation, so per-particle objects were the main source of old-space garbage and of the
 * major-GC pauses that came with it. Typed arrays never move, never box a double and give the
 * renderers a flat run of numbers to read.
 */

/** Alpha follows remaining life. */
export const P_FADE = 1;
/** Drawn as a capsule stretched along the velocity (droplets, sparks). */
export const P_STRETCH = 2;
/** Emissive halo plus a light contribution. */
export const P_GLOW = 4;
/** Radius shrinks over life. */
export const P_SHRINK = 8;

export type ParticleSystem = {
  /** Live particles occupy indices `[0, count)`. */
  count: number;
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly r: Float32Array;
  readonly life: Float32Array;
  /** Initial life, for fades; 0 means "no fade reference". */
  readonly maxLife: Float32Array;
  /** Gravity scale (1 = full). */
  readonly gravity: Float32Array;
  /** Air drag per second (0 = none). */
  readonly drag: Float32Array;
  /** Bit set of `P_*` flags. */
  readonly flags: Uint8Array;
  /** Index into {@link PARTICLE_COLORS}. */
  readonly color: Uint8Array;
  /** Adds a particle; silently dropped once the pool is full. */
  spawn(x: number, y: number, vx: number, vy: number, r: number, life: number, color: number, flags: number, gravity?: number, drag?: number): void;
  /** Advances every particle by `dt` seconds and drops the dead ones, keeping order. */
  step(dt: number): void;
  clear(): void;
};

/** Colours particles can take, by index. Registered once per hue with {@link particleColor}. */
export const PARTICLE_COLORS: string[] = [];
/** The same colours pre-parsed to 0–1 RGBA, so renderers do no string work per particle. */
export const PARTICLE_RGBA: [number, number, number, number][] = [];
const colorIndex = new Map<string, number>();

/** Palette index for a hex colour (at most 256 distinct hues; emitters use a dozen). */
export function particleColor(hex: string): number {
  let i = colorIndex.get(hex);
  if (i === undefined) {
    i = Math.min(255, PARTICLE_COLORS.length);
    if (PARTICLE_COLORS.length < 256) {
      PARTICLE_COLORS.push(hex);
      PARTICLE_RGBA.push(parseColor(hex));
    }
    colorIndex.set(hex, i);
  }
  return i;
}

export function createParticles(capacity = 8192): ParticleSystem {
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const r = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const gravity = new Float32Array(capacity);
  const drag = new Float32Array(capacity);
  const flags = new Uint8Array(capacity);
  const color = new Uint8Array(capacity);
  const sys: ParticleSystem = {
    count: 0,
    capacity,
    x,
    y,
    vx,
    vy,
    r,
    life,
    maxLife,
    gravity,
    drag,
    flags,
    color,
    spawn(px, py, pvx, pvy, pr, plife, pcolor, pflags, pgravity = 1, pdrag = 0) {
      const i = sys.count;
      if (i >= capacity) return;
      x[i] = px;
      y[i] = py;
      vx[i] = pvx;
      vy[i] = pvy;
      r[i] = pr;
      life[i] = plife;
      maxLife[i] = plife;
      gravity[i] = pgravity;
      drag[i] = pdrag;
      flags[i] = pflags;
      color[i] = pcolor;
      sys.count = i + 1;
    },
    step(dt) {
      const n = sys.count;
      let live = 0;
      for (let i = 0; i < n; i++) {
        const l = life[i]! - dt;
        if (l <= 0) continue;
        let pvx = vx[i]!;
        let pvy = vy[i]! - 22 * gravity[i]! * dt;
        const d = drag[i]!;
        if (d) {
          const k = Math.max(0, 1 - d * dt);
          pvx *= k;
          pvy *= k;
        }
        let pr = r[i]!;
        const ml = maxLife[i]!;
        if (flags[i]! & P_SHRINK && ml) pr = Math.max(0.005, pr * (1 - dt / ml));
        // Position uses the pre-update velocity, as the object version did (semi-implicit would be
        // the physics-correct choice, but this is cosmetic and tuned by eye).
        x[live] = x[i]! + vx[i]! * dt;
        y[live] = y[i]! + vy[i]! * dt;
        vx[live] = pvx;
        vy[live] = pvy;
        r[live] = pr;
        life[live] = l;
        maxLife[live] = ml;
        gravity[live] = gravity[i]!;
        drag[live] = d;
        flags[live] = flags[i]!;
        color[live] = color[i]!;
        live++;
      }
      sys.count = live;
    },
    clear() {
      sys.count = 0;
    },
  };
  return sys;
}

/** Advances every particle and drops the dead ones (in place; returns the same pool). */
export function stepParticles(parts: ParticleSystem, dt: number): ParticleSystem {
  parts.step(dt);
  return parts;
}

/** Quad padding around a particle's silhouette, metres (the halo needs more; see {@link particleQuad}). */
export const PARTICLE_PAD = 0.15;

/** How one particle is drawn: a single flat primitive in a padded quad. Scratch, refilled per call. */
export type ParticleQuad = {
  /** `PRIM_DISK` or `PRIM_CAPSULE`. */
  kind: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  /** Fill alpha (life fade applied). */
  alpha: number;
  /** Halo reach in metres; 0 for a plain particle. */
  glow: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Palette index. */
  color: number;
};

export function emptyParticleQuad(): ParticleQuad {
  return { kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 0, alpha: 1, glow: 0, minX: 0, minY: 0, maxX: 0, maxY: 0, color: 0 };
}

/**
 * Fills `out` with how particle `i` should be drawn. Sparks and droplets stretch into a short
 * capsule trailing their velocity; glowing particles get a halo whose reach grows with their size
 * (tight rim on a spark, wide bloom on a fireball) and a quad big enough to hold it.
 */
export function particleQuad(sys: ParticleSystem, i: number, out: ParticleQuad): ParticleQuad {
  const flags = sys.flags[i]!;
  const x = sys.x[i]!;
  const y = sys.y[i]!;
  const r = sys.r[i]!;
  const ml = sys.maxLife[i]!;
  const fade = ml ? Math.max(0, Math.min(1, sys.life[i]! / ml)) : 1;
  out.alpha = flags & P_FADE ? fade : 1;
  out.glow = flags & P_GLOW ? 0.18 + r * 0.8 : 0;
  out.color = sys.color[i]!;
  out.r = r;
  out.ax = x;
  out.ay = y;
  const vx = sys.vx[i]!;
  const vy = sys.vy[i]!;
  if (flags & P_STRETCH && (vx !== 0 || vy !== 0)) {
    const sp = Math.hypot(vx, vy) || 1;
    const l = Math.min(0.5, sp * 0.02);
    out.kind = PRIM_CAPSULE;
    out.bx = x - (vx / sp) * l;
    out.by = y - (vy / sp) * l;
  } else {
    out.kind = PRIM_DISK;
    out.bx = x;
    out.by = y;
  }
  const pad = Math.max(PARTICLE_PAD, out.glow + 0.05) + r;
  out.minX = Math.min(out.ax, out.bx) - pad;
  out.minY = Math.min(out.ay, out.by) - pad;
  out.maxX = Math.max(out.ax, out.bx) + pad;
  out.maxY = Math.max(out.ay, out.by) + pad;
  return out;
}

export type Decal = { x: number; y: number; r: number; color: string; kind?: 'blood' | 'scorch' };

const BLOOD = '#b3161c';
const BLOOD_DARK = '#6e0d12';
const C_BLOOD = particleColor(BLOOD);
const C_BLOOD_DARK = particleColor(BLOOD_DARK);
const C_FIRE = particleColor('#ffb347');
const C_FIRE_CORE = particleColor('#fff1c1');
const C_SPARK = particleColor('#ffd27a');
const C_SMOKE = particleColor('#3a3a40');
const C_FLASH = particleColor('#fff4aa');
const C_WHITE = particleColor('#ffffff');
const C_SHIELD = particleColor('#c8dcff');

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function emitFromEvents(events: SimEvents, particles: ParticleSystem | null, decals: Decal[]): void {
  for (const ev of events) {
    if (ev.type === 'blood') {
      if (particles) {
        const n = Math.min(26, 6 + Math.floor(ev.amount / 5));
        for (let i = 0; i < n; i++) {
          const a = rnd(0, Math.PI * 2);
          const sp = rnd(2.5, 9);
          particles.spawn(ev.x, ev.y, Math.cos(a) * sp, Math.sin(a) * sp + 2, rnd(0.04, 0.09), rnd(0.35, 0.8), i % 3 === 0 ? C_BLOOD_DARK : C_BLOOD, P_STRETCH);
        }
      }
      decals.push({ x: ev.x, y: ev.y, r: 0.14 + Math.min(0.5, ev.amount * 0.012), color: BLOOD_DARK, kind: 'blood' });
      for (let i = 0; i < Math.min(4, Math.floor(ev.amount / 15)); i++) {
        decals.push({ x: ev.x + rnd(-0.6, 0.6), y: ev.y + rnd(-0.5, 0.3), r: rnd(0.05, 0.16), color: BLOOD, kind: 'blood' });
      }
    }
    if (ev.type === 'explosion') {
      decals.push({ x: ev.x, y: ev.y, r: Math.max(0.35, ev.radius * 0.28), color: '#2a1a10', kind: 'scorch' });
      if (!particles) continue;
      // fireball core
      for (let i = 0; i < 10; i++) {
        const a = rnd(0, Math.PI * 2);
        particles.spawn(ev.x, ev.y, Math.cos(a) * rnd(1, 5), Math.sin(a) * rnd(1, 5), rnd(0.25, 0.5) * Math.max(0.6, ev.radius * 0.3), rnd(0.18, 0.32), i % 2 ? C_FIRE : C_FIRE_CORE, P_FADE | P_SHRINK | P_GLOW, 0);
      }
      // sparks
      for (let i = 0; i < 22; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(6, 16);
        particles.spawn(ev.x, ev.y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.03, 0.06), rnd(0.3, 0.7), C_SPARK, P_STRETCH | P_FADE | P_GLOW, 1, 2);
      }
      // smoke
      for (let i = 0; i < 8; i++) {
        const a = rnd(0, Math.PI * 2);
        particles.spawn(ev.x + Math.cos(a) * 0.3, ev.y + Math.sin(a) * 0.3, Math.cos(a) * rnd(0.5, 2), rnd(1.5, 3.5), rnd(0.2, 0.4), rnd(0.6, 1.2), C_SMOKE, P_FADE, -0.15, 1.5);
      }
    }
    if (!particles) continue;
    if (ev.type === 'shot') {
      // muzzle flash
      particles.spawn(ev.x + ev.aimX * 0.1, ev.y + ev.aimY * 0.1, ev.aimX * 3, ev.aimY * 3, 0.16, 0.05, C_FLASH, P_GLOW | P_SHRINK, 0);
      // casing / sparks
      for (let i = 0; i < 3; i++) {
        const spread = rnd(-0.6, 0.6);
        particles.spawn(ev.x, ev.y, (ev.aimX - ev.aimY * spread) * rnd(6, 12), (ev.aimY + ev.aimX * spread) * rnd(6, 12), 0.03, rnd(0.12, 0.25), C_SPARK, P_STRETCH | P_FADE, 0.3);
      }
    }
    if (ev.type === 'hit' && ev.damage > 0) {
      // impact puff
      for (let i = 0; i < 4; i++) {
        const a = rnd(0, Math.PI * 2);
        particles.spawn(ev.x, ev.y, Math.cos(a) * rnd(1, 3), Math.sin(a) * rnd(1, 3), rnd(0.06, 0.12), rnd(0.12, 0.22), C_WHITE, P_FADE | P_SHRINK, 0);
      }
    }
    if (ev.type === 'punch') {
      // a short streak of air along the swing
      for (let i = 0; i < 3; i++) {
        const side = rnd(-0.18, 0.18);
        particles.spawn(ev.x - ev.aimY * side, ev.y + ev.aimX * side, ev.aimX * rnd(7, 11), ev.aimY * rnd(7, 11), rnd(0.03, 0.05), rnd(0.08, 0.16), C_WHITE, P_STRETCH | P_FADE, 0);
      }
    }
    if (ev.type === 'clash') {
      // a ring of bright sparks bursting outwards plus a brief white flash
      particles.spawn(ev.x, ev.y, 0, 0, 0.45, 0.08, C_WHITE, P_FADE | P_GLOW, 0);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rnd(-0.1, 0.1);
        particles.spawn(ev.x, ev.y, Math.cos(a) * rnd(6, 10), Math.sin(a) * rnd(6, 10), 0.045, rnd(0.18, 0.32), C_FLASH, P_STRETCH | P_FADE | P_GLOW, 0.1, 2);
      }
    }
    if (ev.type === 'block') {
      const n = ev.reflected ? 14 : 6;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        particles.spawn(ev.x, ev.y, Math.cos(a) * rnd(3, 8), Math.sin(a) * rnd(3, 8), 0.04, rnd(0.2, 0.4), ev.reflected ? C_WHITE : C_SHIELD, P_STRETCH | P_FADE | (ev.reflected ? P_GLOW : 0), 0.2);
      }
    }
  }
}
