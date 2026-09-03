import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { createDecalLayer, createDecalLayerPool, decalLayerSize, hashPixels, snapDecalToSurface } from '../src/render/fx/decals';
import { emitFromEvents, type Decal } from '../src/render/fx/particles';
import { Transform } from '../src/sim/traits';
import { hold, makeSim, playerOf, runTrack } from './helpers';

const BLOOD = '#5a1010';
const SCORCH = '#2a1a10';

describe('PLAN 4.11 persistent decals', () => {
  it('stamps once into a world-space buffer; later frames do not rebuild marks', () => {
    const layer = createDecalLayer({ x: 0, y: 0, w: 16, h: 10 }, 16);
    const decals: Decal[] = [
      { x: 4, y: 3, r: 0.4, color: BLOOD, kind: 'blood' },
      { x: 8, y: 5, r: 0.6, color: SCORCH, kind: 'scorch' },
    ];
    const n = layer.stampNew(decals);
    expect(n).toBe(2);
    expect(layer.stamped).toBe(2);
    expect(layer.stampCalls).toBe(2);
    expect(layer.dirty).toBe(true);

    const hashAfterStamp = layer.hashPixels();
    expect(hashAfterStamp).toBe(hashPixels(layer));
    const [r, g, _b, a] = layer.sample(4, 3);
    expect(a).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(g);

    layer.dirty = false;
    const calls = layer.stampCalls;
    const stamped = layer.stamped;
    for (let frame = 0; frame < 12; frame++) {
      expect(layer.stampNew(decals)).toBe(0);
      expect(layer.hashPixels()).toBe(hashAfterStamp);
      expect(layer.stampCalls).toBe(calls);
      expect(layer.stamped).toBe(stamped);
      expect(layer.dirty).toBe(false);
    }
  });

  it('buildFrame does not emit blood/scorch SDF groups for stamped marks', () => {
    const sim = makeSim({ settings: { playerCount: 1 } });
    const layer = createDecalLayer(sim.ctx.level.bounds);
    const decals: Decal[] = [];
    emitFromEvents(
      [
        { type: 'blood', x: 8, y: 4, amount: 40 },
        { type: 'explosion', x: 10, y: 3, radius: 2, damage: 20 },
      ],
      null,
      decals,
    );
    layer.stampNew(decals);
    const cam = createCamera(sim.ctx.level.bounds);
    const a = buildFrame(sim, cam, 0, 1280, 720, null, { decalLayer: layer, freezeCamera: true });
    const b = buildFrame(sim, cam, 0, 1280, 720, null, { decalLayer: layer, freezeCamera: true });
    expect(a.decalLayer).toBe(layer);
    expect(b.decalLayer).toBe(layer);
    const decalColors = new Set([BLOOD, SCORCH]);
    expect(a.groups.filter((g) => decalColors.has(g.color)).length).toBe(0);
    expect(b.groups.length).toBe(a.groups.length);
    expect(layer.stampCalls).toBe(decals.length);
  });

  it('blood stains what it lands on: splashes snap onto nearby surfaces and mid-air ones are dropped', () => {
    const sim = makeSim({ level: runTrack, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    for (let i = 0; i < 60; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    const feet = p.get(Transform)!.y - sim.ctx.tuning.height / 2;
    // Chest-height splash over the floor: pulled down onto (and slightly into) the track surface.
    const onFloor: Decal = { x: 20, y: feet + 0.6, r: 0.3, color: BLOOD, kind: 'blood' };
    expect(snapDecalToSurface(sim.ecs, onFloor)).toBe(true);
    expect(onFloor.y).toBeLessThan(feet + 0.05);
    expect(onFloor.y).toBeGreaterThan(feet - 0.3);
    // Way up in the sky: nothing to stain.
    const sky: Decal = { x: 20, y: feet + 6, r: 0.3, color: BLOOD, kind: 'blood' };
    expect(snapDecalToSurface(sim.ecs, sky)).toBe(false);
  });

  it('the layer pool hands back a wiped same-size layer on rotation instead of building a new one', () => {
    const pool = createDecalLayerPool(2);
    const wide = { x: 0, y: 0, w: 64, h: 36 };
    const narrow = { x: -5, y: 2, w: 40, h: 36 };
    const a = pool.acquire(wide);
    a.stampNew([{ x: 4, y: 3, r: 0.4, color: BLOOD, kind: 'blood' }]);
    expect(a.sample(4, 3)[3]).toBeGreaterThan(0);
    pool.release(a);
    pool.release(a); // double release must not duplicate the spare
    expect(pool.size).toBe(1);

    // Different footprint: nothing suitable, so a fresh layer is built and the spare stays put.
    const b = pool.acquire(narrow);
    expect(b).not.toBe(a);
    expect(pool.size).toBe(1);
    expect(b.width).toBe(decalLayerSize(narrow).width);

    // Same footprint but a shifted origin: the spare is recycled, wiped, and re-anchored.
    const shifted = { x: 10, y: -3, w: 64, h: 36 };
    const c = pool.acquire(shifted);
    expect(c).toBe(a);
    expect(pool.size).toBe(0);
    expect(c.bounds).toEqual(shifted);
    expect(c.stamped).toBe(0);
    expect(c.consumed).toBe(0);
    expect(c.dirty).toBe(true);
    expect(c.sample(14, 0)[3]).toBe(0);
    expect(c.hashPixels()).toBe(createDecalLayer(shifted).hashPixels());

    // The pool is bounded: the oldest spare is dropped once it is full.
    pool.release(b);
    pool.release(c);
    pool.release(createDecalLayer({ x: 0, y: 0, w: 24, h: 36 }));
    expect(pool.size).toBe(2);
    expect(pool.acquire(narrow)).not.toBe(b);
  });

  it('GPU renderer uploads the persistent texture only when dirty', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/render/gpu/renderer.ts'), 'utf8');
    expect(src).toContain('if (!layer.dirty && decalTex && decalBind) return');
    expect(src).toContain('device.queue.writeTexture');
    expect(src).toContain('pass.draw(6, 1)');
    const canvas = readFileSync(resolve(process.cwd(), 'src/render/canvas/renderer.ts'), 'utf8');
    expect(canvas).toContain('if (layer.dirty)');
    expect(canvas).toContain('renderer.decalUploads += 1');
    expect(canvas).toContain('layer.dirty = false');
  });
});
