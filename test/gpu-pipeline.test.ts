import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isTgpuFragmentFn, isTgpuVertexFn } from 'typegpu';
import {
  CAMERA_STRIDE,
  createDecalDrawPipeline,
  createSdfDrawPipeline,
  GPU_DRAW_BACKEND,
  GPU_DRAW_PIPELINE_API,
  GROUP_STRIDE,
  isTypeGpuDrawShaders,
  PRIM_STRIDE,
  resolveSdfDrawWgsl,
  sdfFragment,
  sdfVertex,
} from '../src/render/gpu/shaders';
import { resolveGlowWgsl } from '../src/render/gpu/lighting';
import { packGroups } from '../src/render/gpu/pack';
import { PRIM_DISK } from '../src/render/sdf/primitives';

describe('TypeGPU live SDF draw path (PLAN §4.11)', () => {
  it('exposes TypeGPU vertex/fragment DualFns, not leftover WGSL strings', () => {
    expect(isTypeGpuDrawShaders()).toBe(true);
    expect(isTgpuVertexFn(sdfVertex)).toBe(true);
    expect(isTgpuFragmentFn(sdfFragment)).toBe(true);
    expect(sdfVertex.shell.entryPoint).toBe('vertex');
    expect(sdfFragment.shell.entryPoint).toBe('fragment');
    expect(GPU_DRAW_BACKEND).toBe('typegpu');
    expect(GPU_DRAW_PIPELINE_API).toBe('root.createRenderPipeline');
  });

  it('resolves the live draw shaders through TypeGPU (createRenderPipeline input)', () => {
    const wgsl = resolveSdfDrawWgsl();
    expect(wgsl).toMatch(/@vertex/);
    expect(wgsl).toMatch(/@fragment/);
    expect(wgsl).toMatch(/sdfVertex|fn sdfVertex/);
    expect(wgsl).toMatch(/sdfFragment|fn sdfFragment/);
    // Old handwritten WGSL helpers must not be the live path.
    expect(wgsl).not.toMatch(/fn sd_disk\(/);
    expect(wgsl).not.toMatch(/fn sd_rbox\(/);
    expect(wgsl).not.toMatch(/fn smin\(/);
    // PLAN §4.11 lava is `@typegpu/noise` displacement, not sin/cos.
    expect(wgsl).toMatch(/perlin|computeJunctionGradient|getJunctionGradient/i);
    // Pipeline factories used by the renderer are TypeGPU createRenderPipeline wrappers.
    expect(typeof createSdfDrawPipeline).toBe('function');
    expect(typeof createDecalDrawPipeline).toBe('function');
    expect(createSdfDrawPipeline.length).toBe(2);
  });

  it('compiles the live TypeGPU pipeline without implicit i32/u32/f32 conversions', () => {
    const warns: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warns.push(args.map(String).join(' '));
    });
    resolveSdfDrawWgsl();
    resolveGlowWgsl();
    spy.mockRestore();
    expect(warns.filter((w) => w.includes('implicit-conversion'))).toEqual([]);
  });

  it('packs groups to the TypeGPU d.struct strides', () => {
    expect(GROUP_STRIDE).toBe(64);
    expect(CAMERA_STRIDE).toBe(32);
    expect(PRIM_STRIDE).toBeGreaterThanOrEqual(24);
    const packed = packGroups([
      {
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
        color: '#ff0000',
        blend: 'union',
        smoothK: 0,
        layer: 1,
        primitives: [{ kind: PRIM_DISK, ax: 0.5, ay: 0.5, bx: 0, by: 0, r: 0.2 }],
      },
    ]);
    expect(packed.groupCount).toBe(1);
    expect(packed.primCount).toBe(1);
    expect(packed.groupBytes.byteLength).toBeGreaterThanOrEqual(GROUP_STRIDE);
    expect(packed.primBytes.byteLength).toBeGreaterThanOrEqual(PRIM_STRIDE);
    const gv = new DataView(packed.groupBytes);
    expect(gv.getFloat32(0, true)).toBe(0);
    expect(gv.getFloat32(16, true)).toBeCloseTo(1);
    expect(gv.getUint32(36, true)).toBe(1);
  });
});

describe('GPU boot order (PLAN §4.11)', () => {
  it('probes TypeGPU on a canvas that does not already have a 2D context', () => {
    const game = readFileSync(resolve(process.cwd(), 'src/game.ts'), 'utf8');
    expect(game).toContain('attachPreferredRenderer');
    const attach = game.indexOf('async function attachPreferredRenderer');
    const body = game.slice(attach, game.indexOf('async function switchRenderer'));
    expect(body.indexOf('tryCreateGpuRenderer')).toBeGreaterThan(-1);
    expect(body.indexOf('tryCreateGpuRenderer')).toBeLessThan(body.indexOf('createCanvasRenderer'));
    const renderer = readFileSync(resolve(process.cwd(), 'src/render/gpu/renderer.ts'), 'utf8');
    expect(renderer).toContain("canvas.getContext('webgpu')");
    expect(renderer).toContain('createSdfDrawPipeline');
    expect(renderer).toContain('copyTextureToBuffer');
    expect(renderer).toContain('COPY_SRC');
    expect(renderer).toContain('readFramebuffer');
    expect(renderer).toContain('initFromDevice');
    expect(renderer).toContain('replayFrameReadback');
  });
});

describe('PLAN §6 GPU e2e gate', () => {
  it('reads the WebGPU framebuffer instead of faking pixels from getContext', () => {
    const spec = readFileSync(resolve(process.cwd(), 'e2e/gpu.spec.ts'), 'utf8');
    expect(spec).toContain('readFramebuffer');
    expect(spec).toContain('webgpu-copy');
    expect(spec).not.toMatch(/if \(canvas\.getContext\('webgpu'\)\)/);
  });
});

describe('TypeGPU glow pass', () => {
  it('resolves glow DualFns used by the lighting draw pipeline', () => {
    const wgsl = resolveGlowWgsl();
    expect(wgsl).toMatch(/@vertex/);
    expect(wgsl).toMatch(/@fragment/);
    expect(wgsl).not.toMatch(/fn vs\(/);
    expect(wgsl).not.toMatch(/fn fs\(/);
  });
});
