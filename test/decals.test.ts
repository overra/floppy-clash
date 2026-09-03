import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { createDecalLayer, hashPixels } from '../src/render/fx/decals';
import { emitFromEvents, type Decal } from '../src/render/fx/particles';
import { makeSim } from './helpers';

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
    const [r, g, b, a] = layer.sample(4, 3);
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
      [],
      decals,
    );
    layer.stampNew(decals);
    const cam = createCamera(sim.ctx.level.bounds);
    const a = buildFrame(sim, cam, 0, 1280, 720, [], { decalLayer: layer, freezeCamera: true });
    const b = buildFrame(sim, cam, 0, 1280, 720, [], { decalLayer: layer, freezeCamera: true });
    expect(a.decalLayer).toBe(layer);
    expect(b.decalLayer).toBe(layer);
    const decalColors = new Set([BLOOD, SCORCH]);
    expect(a.groups.filter((g) => decalColors.has(g.color)).length).toBe(0);
    expect(b.groups.length).toBe(a.groups.length);
    expect(layer.stampCalls).toBe(decals.length);
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
