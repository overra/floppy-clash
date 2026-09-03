import type { SimEvents } from '../../sim/events';

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  color: string;
};

export type Decal = { x: number; y: number; r: number; color: string; kind?: 'blood' | 'scorch' };

export function stepParticles(parts: Particle[], dt: number): Particle[] {
  const next: Particle[] = [];
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 18 * dt;
    p.life -= dt;
    if (p.life > 0) next.push(p);
  }
  return next;
}

export function emitFromEvents(events: SimEvents, particles: Particle[], decals: Decal[]): void {
  for (const ev of events) {
    if (ev.type === 'blood') {
      for (let i = 0; i < Math.min(18, 4 + ev.amount / 8); i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * (2 + Math.random() * 6),
          vy: Math.sin(a) * (2 + Math.random() * 6),
          r: 0.05 + Math.random() * 0.06,
          life: 0.4 + Math.random() * 0.4,
          color: '#8b1e1e',
        });
      }
      decals.push({
        x: ev.x,
        y: ev.y,
        r: 0.15 + ev.amount * 0.01,
        color: '#5a1010',
        kind: 'blood',
      });
    }
    if (ev.type === 'explosion') {
      decals.push({
        x: ev.x,
        y: ev.y,
        r: Math.max(0.35, ev.radius * 0.28),
        color: '#2a1a10',
        kind: 'scorch',
      });
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * 8,
          vy: Math.sin(a) * 8,
          r: 0.08,
          life: 0.5,
          color: i % 2 ? '#ffb347' : '#fff1c1',
        });
      }
    }
    if (ev.type === 'shot') {
      particles.push({
        x: ev.x,
        y: ev.y,
        vx: ev.aimX * 2,
        vy: ev.aimY * 2,
        r: 0.08,
        life: 0.08,
        color: '#fff4aa',
      });
    }
  }
}
