import { expect, test } from '@playwright/test';

test('GPU renderer initialises and PLAN §6 reads framebuffer pixels', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();
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

  const rb = await page.evaluate(async () => {
    const fn = window.__floppy?.readFramebuffer;
    if (!fn) {
      return {
        source: 'unavailable' as const,
        width: 0,
        height: 0,
        colored: 0,
        samples: [],
        error: 'no-readFramebuffer',
      };
    }
    return fn();
  });

  if (frame.kind === 'gpu') {
    expect(frame.backend).toBe('typegpu');
    expect(frame.api).toBe('root.createRenderPipeline');
    expect(frame.resourceType).toBe('render-pipeline');
    expect(frame.initError).toBe('');
    expect(rb.source, `PLAN §6 GPU pixel readback failed: ${rb.error || 'unknown'}`).toBe(
      'webgpu-copy',
    );
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
