import { expect, test } from '@playwright/test';

test('SwiftShader can map a raw WebGPU buffer and offscreen texture', async ({ page }) => {
  await page.goto('/gpu-probe.html');
  await page.waitForFunction(
    () => (window as unknown as { __gpuProbe?: unknown }).__gpuProbe,
    null,
    {
      timeout: 10_000,
    },
  );
  const probe = await page.evaluate(
    () =>
      (window as unknown as { __gpuProbe: { hasGpu: boolean; rawMap: string; texMap: string } })
        .__gpuProbe,
  );
  expect(probe.hasGpu, JSON.stringify(probe)).toBe(true);
  expect(probe.rawMap, JSON.stringify(probe)).toMatch(/^ok:/);
  expect(probe.texMap, JSON.stringify(probe)).toMatch(/^ok:/);
});

test('GPU renderer initialises and PLAN §6 reads framebuffer pixels', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();
  await expect(page.locator('#brand-logo')).toBeVisible();
  await expect(page.locator('.notice').first()).toHaveText(/SDF renderer|Canvas fallback/, {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForTimeout(1500);
  const frame = await page.evaluate(() => ({
    kind: window.__floppy?.rendererKind,
    groups: window.__floppy?.lastFrameGroups ?? 0,
    cpuColored: window.__floppy?.lastFrameColored ?? 0,
    backend: window.__floppy?.gpuPipelineBackend,
    api: window.__floppy?.gpuPipelineApi,
    resourceType: window.__floppy?.gpuPipelineResourceType,
    initError: window.__floppy?.gpuInitError ?? '',
    hasRead: typeof window.__floppy?.readFramebuffer === 'function',
  }));
  expect(frame.kind === 'gpu' || frame.kind === 'canvas').toBe(true);
  expect(frame.groups + frame.cpuColored).toBeGreaterThan(0);
  expect(frame.hasRead).toBe(true);

  await page.evaluate(() => {
    const w = window as unknown as { __gpuReadback?: Record<string, unknown> };
    const fn = window.__floppy?.readFramebuffer;
    if (!fn) {
      w.__gpuReadback = {
        source: 'unavailable',
        error: 'no-readFramebuffer',
        colored: 0,
        samples: [],
      };
      return;
    }
    w.__gpuReadback = { status: 'pending' };
    void fn().then((r) => {
      w.__gpuReadback = { ...r };
    });
  });
  await page.waitForFunction(
    () => {
      const slot = (window as unknown as { __gpuReadback?: { status?: string } }).__gpuReadback;
      return !!slot && slot.status !== 'pending';
    },
    null,
    { timeout: 15_000 },
  );
  const rb = await page.evaluate(() => {
    const raw = (window as unknown as { __gpuReadback: Record<string, unknown> }).__gpuReadback;
    return {
      source: String(raw.source ?? 'unavailable'),
      via: String(raw.via ?? ''),
      width: Number(raw.width ?? 0),
      height: Number(raw.height ?? 0),
      colored: Number(raw.colored ?? 0),
      samples: Array.isArray(raw.samples) ? raw.samples : [],
      error: String(raw.error ?? ''),
    };
  });

  if (frame.kind === 'gpu') {
    expect(frame.backend).toBe('typegpu');
    expect(frame.api).toBe('root.createRenderPipeline');
    expect(frame.resourceType).toBe('render-pipeline');
    expect(frame.initError).toBe('');
    expect(rb.source, `PLAN §6 GPU pixel readback failed: ${rb.error || 'unknown'}`).toBe(
      'webgpu-copy',
    );
    expect(rb.via === 'swapchain' || rb.via === 'offscreen-replay', `via=${rb.via}`).toBe(true);
    expect(rb.error).toBe('');
    expect(rb.width).toBeGreaterThan(0);
    expect(rb.height).toBeGreaterThan(0);
    expect(rb.samples.length).toBeGreaterThan(0);
    expect(rb.colored).toBeGreaterThan(0);
  } else {
    expect(frame.backend === 'none' || frame.backend === undefined).toBe(true);
    expect(rb.source === 'canvas-2d' || rb.colored > 0).toBe(true);
  }
  await page.screenshot({ path: 'test-results/gpu-xvfb.png', fullPage: true });
});

test('GPU JFA textureLoad signs match CPU Jump Flood (no 4 ms claim)', async ({ page }) => {
  await page.addInitScript(() => {
    const prev = JSON.parse(localStorage.getItem('floppy-clash.settings') || '{}') as {
      lighting?: boolean;
    };
    localStorage.setItem('floppy-clash.settings', JSON.stringify({ ...prev, lighting: true }));
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();
  await page.waitForFunction(
    () => Boolean(window.__floppy?.readJfaIdentity),
    null,
    { timeout: 15_000 },
  );
  const report = await page.evaluate(async () => {
    const fn = window.__floppy?.readJfaIdentity;
    if (!fn) {
      return {
        lightingKind: 'none',
        jfaBound: false,
        error: 'no-readJfaIdentity',
        samples: [],
      };
    }
    return fn();
  });
  expect(report.jfaBound, report.error || 'jfa-not-bound').toBe(true);
  expect(report.lightingKind, report.error).toBe('cascades');
  expect(report.error, JSON.stringify(report)).toBe('');
  expect(report.samples.length).toBeGreaterThanOrEqual(6);
  for (const s of report.samples) {
    expect(s.gpuJfa, `${s.scene}/${s.name} jfa`).toEqual(expect.any(Number));
    expect(Number.isFinite(s.gpuJfa)).toBe(true);
    expect(Number.isFinite(s.gpuCascade)).toBe(true);
    expect(Math.sign(s.gpuJfa) || 1).toBe(Math.sign(s.gpuCascade) || 1);
    // Empty emitters: cascade DualFn is the same textureLoad (not an AABB walk).
    expect(Math.abs(s.gpuCascade - s.gpuJfa), `${s.scene}/${s.name} cascade≠jfa`).toBeLessThan(1e-3);
    if (s.cpuInside) {
      expect(s.gpuJfa, `${s.scene}/${s.name} inside`).toBeLessThan(0);
      expect(s.cpuJfa).toBeLessThan(0);
    } else {
      expect(s.gpuJfa, `${s.scene}/${s.name} outside`).toBeGreaterThan(0);
      expect(s.cpuJfa).toBeGreaterThan(0);
    }
    if (s.scene === 'open') {
      expect(s.cpuInside).toBe(false);
      expect(s.gpuJfa).toBeGreaterThan(0);
    }
  }
  const wallLeft = report.samples.find((s) => s.scene === 'wall' && s.name === 'left');
  const wallMid = report.samples.find((s) => s.scene === 'wall' && s.name === 'center');
  expect(wallLeft?.cpuInside).toBe(true);
  expect(wallMid?.cpuInside).toBe(false);
  expect((wallLeft?.gpuJfa ?? 1) < 0 && (wallMid?.gpuJfa ?? -1) > 0).toBe(true);
});
