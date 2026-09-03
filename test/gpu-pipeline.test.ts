import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isTgpuFragmentFn, isTgpuVertexFn } from 'typegpu';
import {
  CAMERA_STRIDE,
  createBgDrawPipeline,
  createDecalDrawPipeline,
  createPostDrawPipeline,
  createSdfDrawPipeline,
  GPU_DRAW_BACKEND,
  GPU_DRAW_PIPELINE_API,
  GROUP_STRIDE,
  isTypeGpuDrawShaders,
  POST_STRIDE,
  PRIM_STRIDE,
  resolveBgWgsl,
  resolvePostWgsl,
  resolveSdfDrawWgsl,
  sdfFragment,
  sdfVertex,
} from '../src/render/gpu/shaders';
import {
  resolveCascadeBlitWgsl,
  resolveCascadeSdfWgsl,
  resolveClassifyWgsl,
  resolveGlowWgsl,
  resolveIdentityWgsl,
} from '../src/render/gpu/lighting';
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
    expect(wgsl).toMatch(/sdBezier|bezier/i);
    expect(wgsl).toMatch(/opSmoothDifference|smoothDifference|smooth_difference/i);
    expect(wgsl).toMatch(/warpWorldGpu|hole/i);
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
    resolveClassifyWgsl();
    resolveCascadeSdfWgsl();
    resolveCascadeBlitWgsl();
    resolveIdentityWgsl();
    resolvePostWgsl();
    resolveBgWgsl();
    spy.mockRestore();
    expect(warns.filter((w) => w.includes('implicit-conversion'))).toEqual([]);
  });

  it('packs groups to the TypeGPU d.struct strides', () => {
    expect(GROUP_STRIDE).toBe(64);
    expect(CAMERA_STRIDE).toBe(48);
    expect(POST_STRIDE).toBe(32);
    expect(PRIM_STRIDE).toBeGreaterThanOrEqual(32);
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

  it('packs groups in layer order so pass 1 draws behind the world', () => {
    const packed = packGroups([
      {
        minX: 9,
        minY: 0,
        maxX: 10,
        maxY: 1,
        color: '#ffffff',
        blend: 'union',
        smoothK: 0,
        layer: 5,
        primitives: [{ kind: PRIM_DISK, ax: 9, ay: 0, bx: 0, by: 0, r: 0.1 }],
      },
      {
        minX: 1,
        minY: 0,
        maxX: 2,
        maxY: 1,
        color: '#000000',
        blend: 'union',
        smoothK: 0,
        layer: 0,
        primitives: [{ kind: PRIM_DISK, ax: 1, ay: 0, bx: 0, by: 0, r: 0.1 }],
      },
    ]);
    const gv = new DataView(packed.groupBytes);
    expect(gv.getFloat32(0, true)).toBe(1);
    expect(gv.getFloat32(GROUP_STRIDE, true)).toBe(9);
    expect(packed.layer0Count).toBe(1);
  });

  it('resolves the PLAN §4.11 post overlay DualFns', () => {
    const wgsl = resolvePostWgsl();
    expect(wgsl).toMatch(/@vertex/);
    expect(wgsl).toMatch(/@fragment/);
    expect(wgsl).toMatch(/warpPostUvGpu|hole/i);
    expect(typeof createPostDrawPipeline).toBe('function');
  });

  it('resolves the fullscreen theme gradient DualFns', () => {
    const wgsl = resolveBgWgsl();
    expect(wgsl).toMatch(/@vertex/);
    expect(wgsl).toMatch(/@fragment/);
    expect(typeof createBgDrawPipeline).toBe('function');
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
    expect(renderer).toContain('layer0Count');
    expect(renderer).toContain('createPostDrawPipeline');
    expect(renderer).toContain('createBgDrawPipeline');
    expect(renderer).toContain('sceneTex');
    expect(renderer).toContain('ensureScene');
  });
});

describe('PLAN §6 GPU e2e gate', () => {
  it('reads the WebGPU framebuffer instead of faking pixels from getContext', () => {
    const spec = readFileSync(resolve(process.cwd(), 'e2e/gpu.spec.ts'), 'utf8');
    expect(spec).toContain('readFramebuffer');
    expect(spec).toContain('webgpu-copy');
    expect(spec).not.toMatch(/if \(canvas\.getContext\('webgpu'\)\)/);
    expect(spec).toContain('readJfaIdentity');
    expect(spec).not.toContain('LIGHTING_BUDGET_MS');
  });

  it('applies lighting on the framebuffer-copy return path', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/render/gpu/renderer.ts'), 'utf8');
    const copyIdx = src.indexOf('encoder.copyTextureToBuffer');
    const afterCopy = src.slice(copyIdx, copyIdx + 900);
    expect(afterCopy).toContain('lighting?.apply');
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

describe('TypeGPU GI classify / cascades (PLAN 4.11)', () => {
  it('resolves live-solid classify and JFA-texture cascade DualFns', () => {
    const classify = resolveClassifyWgsl();
    expect(classify).toMatch(/classifyLiveSolidGpu|fn classifyLiveSolidGpu/);
    expect(classify).not.toMatch(/size\.x\s*\/\s*4/);
    const sdf = resolveCascadeSdfWgsl();
    expect(sdf).toMatch(/cascadeJfaSdfGpu|fn cascadeJfaSdfGpu/);
    expect(sdf).toMatch(/textureLoad/);
    expect(sdf).not.toMatch(/hypot\(uv\.x - 0\.5/);
    expect(sdf).not.toMatch(/cascadeSceneSdfGpu/);
    const blit = resolveCascadeBlitWgsl();
    expect(blit).toMatch(/@vertex/);
    expect(blit).toMatch(/@fragment/);
    const ident = resolveIdentityWgsl();
    expect(ident).toMatch(/textureLoad/);
    expect(ident).toMatch(/jfaIdentityCompute|fn jfaIdentityCompute/);
    expect(ident).not.toMatch(/cascadeSceneSdfGpu/);
  });
});
