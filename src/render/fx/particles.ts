import type { Entity, World } from 'koota';
import type { SimEvents } from '../../sim/events';
import { FxDecal, FxParticle, packColor, unpackColor } from './world';

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

/** PLAN 4.4: spawn cosmetic particles/decals as render-world entities. */
export function emitIntoWorld(events: SimEvents, world: World): void {
  const particles: Particle[] = [];
  const decals: Decal[] = [];
  emitFromEvents(events, particles, decals);
  for (const p of particles) {
    world.spawn(
      FxParticle({
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        r: p.r,
        life: p.life,
        color: packColor(p.color),
      }),
    );
  }
  for (const d of decals) {
    world.spawn(
      FxDecal({
        x: d.x,
        y: d.y,
        r: d.r,
        color: packColor(d.color),
        kind: d.kind === 'scorch' ? 1 : 0,
        stamped: 0,
      }),
    );
  }
}

export function stepFxParticles(world: World, dt: number): void {
  const dead: Entity[] = [];
  world.query(FxParticle).updateEach(([p], e) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 18 * dt;
    p.life -= dt;
    if (p.life <= 0) dead.push(e);
  });
  for (const e of dead) e.destroy();
}

export function listParticles(world: World): Particle[] {
  const out: Particle[] = [];
  world.query(FxParticle).updateEach(([p]) => {
    out.push({
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      r: p.r,
      life: p.life,
      color: unpackColor(p.color),
    });
  });
  return out;
}

export function listDecals(world: World): Decal[] {
  const out: Decal[] = [];
  world.query(FxDecal).updateEach(([d]) => {
    out.push({
      x: d.x,
      y: d.y,
      r: d.r,
      color: unpackColor(d.color),
      kind: d.kind === 1 ? 'scorch' : 'blood',
    });
  });
  return out;
}
