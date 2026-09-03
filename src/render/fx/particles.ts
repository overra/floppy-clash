import type { SimEvents } from '../../sim/events';

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  color: string;
  /** Initial life, for fades. */
  maxLife?: number;
  /** Gravity scale (1 = full). */
  gravity?: number;
  /** Air drag per second (0 = none). */
  drag?: number;
  /** Fade alpha out over life. */
  fade?: boolean;
  /** Stretch along velocity (droplets, sparks). */
  stretch?: boolean;
  /** Emissive halo and a light contribution. */
  glow?: boolean;
  /** Shrink over life. */
  shrink?: boolean;
};

export type Decal = { x: number; y: number; r: number; color: string; kind?: 'blood' | 'scorch' };

const BLOOD = '#b3161c';
const BLOOD_DARK = '#6e0d12';

export function stepParticles(parts: Particle[], dt: number): Particle[] {
  const next: Particle[] = [];
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 22 * (p.gravity ?? 1) * dt;
    if (p.drag) {
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
    }
    p.life -= dt;
    if (p.shrink && p.maxLife) p.r = Math.max(0.005, p.r * (1 - dt / p.maxLife));
    if (p.life > 0) next.push(p);
  }
  return next;
}

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function emitFromEvents(events: SimEvents, particles: Particle[], decals: Decal[]): void {
  for (const ev of events) {
    if (ev.type === 'blood') {
      const n = Math.min(26, 6 + Math.floor(ev.amount / 5));
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(2.5, 9);
        const life = rnd(0.35, 0.8);
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp + 2,
          r: rnd(0.04, 0.09),
          life,
          maxLife: life,
          color: i % 3 === 0 ? BLOOD_DARK : BLOOD,
          stretch: true,
          fade: false,
        });
      }
      decals.push({ x: ev.x, y: ev.y, r: 0.14 + Math.min(0.5, ev.amount * 0.012), color: BLOOD_DARK, kind: 'blood' });
      for (let i = 0; i < Math.min(4, Math.floor(ev.amount / 15)); i++) {
        decals.push({ x: ev.x + rnd(-0.6, 0.6), y: ev.y + rnd(-0.5, 0.3), r: rnd(0.05, 0.16), color: BLOOD, kind: 'blood' });
      }
    }
    if (ev.type === 'explosion') {
      decals.push({ x: ev.x, y: ev.y, r: Math.max(0.35, ev.radius * 0.28), color: '#2a1a10', kind: 'scorch' });
      // fireball core
      for (let i = 0; i < 10; i++) {
        const a = rnd(0, Math.PI * 2);
        const life = rnd(0.18, 0.32);
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * rnd(1, 5),
          vy: Math.sin(a) * rnd(1, 5),
          r: rnd(0.25, 0.5) * Math.max(0.6, ev.radius * 0.3),
          life,
          maxLife: life,
          color: i % 2 ? '#ffb347' : '#fff1c1',
          gravity: 0,
          fade: true,
          shrink: true,
          glow: true,
        });
      }
      // sparks
      for (let i = 0; i < 22; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(6, 16);
        const life = rnd(0.3, 0.7);
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: rnd(0.03, 0.06),
          life,
          maxLife: life,
          color: '#ffd27a',
          stretch: true,
          fade: true,
          glow: true,
          drag: 2,
        });
      }
      // smoke
      for (let i = 0; i < 8; i++) {
        const a = rnd(0, Math.PI * 2);
        const life = rnd(0.6, 1.2);
        particles.push({
          x: ev.x + Math.cos(a) * 0.3,
          y: ev.y + Math.sin(a) * 0.3,
          vx: Math.cos(a) * rnd(0.5, 2),
          vy: rnd(1.5, 3.5),
          r: rnd(0.2, 0.4),
          life,
          maxLife: life,
          color: '#3a3a40',
          gravity: -0.15,
          fade: true,
          drag: 1.5,
        });
      }
    }
    if (ev.type === 'shot') {
      // muzzle flash
      particles.push({
        x: ev.x + ev.aimX * 0.1,
        y: ev.y + ev.aimY * 0.1,
        vx: ev.aimX * 3,
        vy: ev.aimY * 3,
        r: 0.16,
        life: 0.05,
        maxLife: 0.05,
        color: '#fff4aa',
        gravity: 0,
        glow: true,
        shrink: true,
      });
      // casing / sparks
      for (let i = 0; i < 3; i++) {
        const spread = rnd(-0.6, 0.6);
        const life = rnd(0.12, 0.25);
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: (ev.aimX - ev.aimY * spread) * rnd(6, 12),
          vy: (ev.aimY + ev.aimX * spread) * rnd(6, 12),
          r: 0.03,
          life,
          maxLife: life,
          color: '#ffd27a',
          stretch: true,
          fade: true,
          gravity: 0.3,
        });
      }
    }
    if (ev.type === 'hit' && ev.damage > 0) {
      // impact puff
      for (let i = 0; i < 4; i++) {
        const a = rnd(0, Math.PI * 2);
        const life = rnd(0.12, 0.22);
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * rnd(1, 3),
          vy: Math.sin(a) * rnd(1, 3),
          r: rnd(0.06, 0.12),
          life,
          maxLife: life,
          color: '#ffffff',
          gravity: 0,
          fade: true,
          shrink: true,
        });
      }
    }
    if (ev.type === 'punch') {
      // a short streak of air along the swing
      for (let i = 0; i < 3; i++) {
        const life = rnd(0.08, 0.16);
        const side = rnd(-0.18, 0.18);
        particles.push({
          x: ev.x - ev.aimY * side,
          y: ev.y + ev.aimX * side,
          vx: ev.aimX * rnd(7, 11),
          vy: ev.aimY * rnd(7, 11),
          r: rnd(0.03, 0.05),
          life,
          maxLife: life,
          color: '#ffffff',
          stretch: true,
          fade: true,
          gravity: 0,
        });
      }
    }
    if (ev.type === 'clash') {
      // a ring of bright sparks bursting outwards plus a brief white flash
      particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, r: 0.45, life: 0.08, maxLife: 0.08, color: '#ffffff', gravity: 0, fade: true, glow: true, shrink: false });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rnd(-0.1, 0.1);
        const life = rnd(0.18, 0.32);
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * rnd(6, 10),
          vy: Math.sin(a) * rnd(6, 10),
          r: 0.045,
          life,
          maxLife: life,
          color: '#fff4aa',
          stretch: true,
          fade: true,
          glow: true,
          gravity: 0.1,
          drag: 2,
        });
      }
    }
    if (ev.type === 'block') {
      const n = ev.reflected ? 14 : 6;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const life = rnd(0.2, 0.4);
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * rnd(3, 8),
          vy: Math.sin(a) * rnd(3, 8),
          r: 0.04,
          life,
          maxLife: life,
          color: ev.reflected ? '#ffffff' : '#c8dcff',
          stretch: true,
          fade: true,
          glow: ev.reflected,
          gravity: 0.2,
        });
      }
    }
  }
}
