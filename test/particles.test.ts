import { describe, expect, it } from 'vitest';
import { Layer, group } from '../src/render/frame';
import {
  PARTICLE_COLORS,
  P_FADE,
  P_GLOW,
  P_SHRINK,
  P_STRETCH,
  createParticles,
  emitFromEvents,
  emptyParticleQuad,
  particleColor,
  particleQuad,
} from '../src/render/fx/particles';
import { GROUP_STRIDE, PRIM_STRIDE, packGroups } from '../src/render/gpu/pack';
import { PRIM_CAPSULE, PRIM_DISK } from '../src/render/sdf/primitives';

describe('particle pool', () => {
  it('spawns into typed arrays, steps in place and compacts the dead without reordering the living', () => {
    const sys = createParticles(8);
    const c = particleColor('#ff0000');
    sys.spawn(0, 0, 1, 0, 0.1, 0.05, c, 0); // dies on the first step
    sys.spawn(1, 1, 0, 0, 0.1, 1, c, P_FADE, 0);
    sys.spawn(2, 2, 0, 0, 0.2, 1, c, P_SHRINK, 0);
    expect(sys.count).toBe(3);
    sys.step(0.1);
    expect(sys.count).toBe(2);
    expect(sys.x[0]).toBeCloseTo(1);
    expect(sys.x[1]).toBeCloseTo(2);
    expect(sys.life[0]).toBeCloseTo(0.9);
    // gravity 0 leaves vy alone; shrink scales the radius by the life spent
    expect(sys.vy[0]).toBeCloseTo(0);
    expect(sys.r[1]).toBeCloseTo(0.2 * (1 - 0.1 / 1));
    // a full pool drops new spawns rather than growing
    for (let i = 0; i < 20; i++) sys.spawn(0, 0, 0, 0, 0.1, 1, c, 0);
    expect(sys.count).toBe(8);
    sys.clear();
    expect(sys.count).toBe(0);
  });

  it('gravity and drag act on velocity, and the position integrates the pre-step velocity', () => {
    const sys = createParticles(4);
    sys.spawn(0, 0, 2, 0, 0.1, 1, 0, 0, 1, 0.5);
    sys.step(0.1);
    expect(sys.x[0]).toBeCloseTo(0.2);
    expect(sys.vy[0]).toBeCloseTo(-22 * 0.1 * (1 - 0.5 * 0.1));
    expect(sys.vx[0]).toBeCloseTo(2 * (1 - 0.5 * 0.1));
  });

  it('emitters register a small palette and fill the pool from sim events', () => {
    const sys = createParticles(512);
    emitFromEvents(
      [
        { type: 'blood', x: 1, y: 2, amount: 40 },
        { type: 'explosion', x: 3, y: 4, radius: 2, damage: 20 },
        { type: 'shot', source: 0, weaponId: 'pistol', x: 5, y: 6, aimX: 1, aimY: 0 },
      ],
      sys,
      [],
    );
    // 6 + 40/5 blood, 10 + 22 + 8 explosion, 1 + 3 shot
    expect(sys.count).toBe(14 + 40 + 4);
    expect(PARTICLE_COLORS.length).toBeGreaterThanOrEqual(9);
    expect(PARTICLE_COLORS.length).toBeLessThanOrEqual(256);
    for (let i = 0; i < sys.count; i++) expect(sys.color[i]).toBeLessThan(PARTICLE_COLORS.length);
    // no pool: decals still land, particles are simply not produced
    const decals: { x: number; y: number }[] = [];
    emitFromEvents([{ type: 'blood', x: 1, y: 2, amount: 40 }], null, decals as never);
    expect(decals.length).toBeGreaterThan(0);
  });

  it('describes each particle as one flat primitive: stretched sparks become capsules, glows pad the quad', () => {
    const sys = createParticles(4);
    const c = particleColor('#00ff00');
    sys.spawn(1, 1, 3, 4, 0.05, 0.5, c, P_STRETCH | P_FADE | P_GLOW);
    sys.spawn(2, 2, 0, 0, 0.3, 1, c, 0);
    sys.life[0] = 0.25;
    const q = emptyParticleQuad();
    particleQuad(sys, 0, q);
    expect(q.kind).toBe(PRIM_CAPSULE);
    expect(q.alpha).toBeCloseTo(0.5);
    expect(q.glow).toBeCloseTo(0.18 + 0.05 * 0.8);
    // trail points against the velocity, at most half a metre long
    const l = Math.min(0.5, 5 * 0.02);
    expect(q.bx).toBeCloseTo(1 - (3 / 5) * l);
    expect(q.by).toBeCloseTo(1 - (4 / 5) * l);
    expect(q.minX).toBeLessThanOrEqual(Math.min(q.ax, q.bx) - q.r - q.glow);
    expect(q.maxY).toBeGreaterThanOrEqual(Math.max(q.ay, q.by) + q.r + q.glow);
    particleQuad(sys, 1, q);
    expect(q.kind).toBe(PRIM_DISK);
    expect(q.alpha).toBe(1);
    expect(q.glow).toBe(0);
    expect(q.minX).toBeCloseTo(2 - 0.3 - 0.15);
  });

  it('packs particles as single-primitive instances between the projectile and overlay layers', () => {
    const sys = createParticles(4);
    const red = particleColor('#ff0000');
    sys.spawn(5, 5, 0, 0, 0.1, 1, red, P_GLOW);
    sys.spawn(6, 6, 0, 0, 0.1, 1, red, 0);
    const dot = { kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 1 };
    const groups = [group([dot], '#111111', Layer.Solids), group([dot], '#222222', Layer.Projectiles), group([dot], '#333333', Layer.Overlay)];
    const packed = packGroups(groups, sys);
    expect(packed.groupCount).toBe(5);
    expect(packed.primCount).toBe(5);
    const g = new DataView(packed.groupBytes);
    const p = new DataView(packed.primBytes);
    const color = (i: number) => [g.getFloat32(i * GROUP_STRIDE + 16, true), g.getFloat32(i * GROUP_STRIDE + 20, true), g.getFloat32(i * GROUP_STRIDE + 24, true)];
    // order: solids, projectiles, particle, particle, overlay
    expect(color(1)[0]).toBeCloseTo(0x22 / 255);
    expect(color(2)).toEqual([1, 0, 0]);
    expect(color(3)).toEqual([1, 0, 0]);
    expect(color(4)[0]).toBeCloseTo(0x33 / 255);
    // the particle instances point at their own primitive, flat style, glow only where flagged
    expect(g.getUint32(2 * GROUP_STRIDE + 32, true)).toBe(2);
    expect(g.getUint32(2 * GROUP_STRIDE + 36, true)).toBe(1);
    expect(g.getUint32(2 * GROUP_STRIDE + 48, true)).toBe(3);
    expect(g.getUint32(2 * GROUP_STRIDE + 52, true)).toBe(1);
    expect(g.getFloat32(2 * GROUP_STRIDE + 56, true)).toBeCloseTo(0.18 + 0.1 * 0.8);
    expect(g.getUint32(3 * GROUP_STRIDE + 48, true)).toBe(0);
    expect(p.getUint32(2 * PRIM_STRIDE, true)).toBe(PRIM_DISK);
    expect(p.getFloat32(2 * PRIM_STRIDE + 4, true)).toBeCloseTo(5);
    expect(p.getFloat32(3 * PRIM_STRIDE + 4, true)).toBeCloseTo(6);
  });

  it('packs particles last when nothing sits above them, and drops them first at the caps', () => {
    const sys = createParticles(4);
    sys.spawn(5, 5, 0, 0, 0.1, 1, 0, 0);
    const dot = { kind: PRIM_DISK, ax: 0, ay: 0, bx: 0, by: 0, r: 1 };
    const groups = [group([dot], '#111111', Layer.Solids)];
    expect(packGroups(groups, sys).groupCount).toBe(2);
    expect(packGroups([], sys).groupCount).toBe(1);
    expect(packGroups(groups, null).groupCount).toBe(1);
  });
});
