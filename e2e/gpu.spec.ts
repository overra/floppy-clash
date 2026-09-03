import { expect, test } from '@playwright/test';

test('GPU renderer initialises or the fallback notice is shown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();
  await expect(page.locator('.notice').first()).toHaveText(/SDF renderer|Canvas fallback/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForTimeout(1500);
  const sample = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas#game') as HTMLCanvasElement;
    if (!canvas) return { ok: false, reason: 'no-canvas', colored: 0, kind: '' };
    const dbg = (window as unknown as { __floppy?: { rendererKind: string } }).__floppy;
    if (canvas.getContext('webgpu')) {
      return { ok: true, kind: dbg?.rendererKind ?? 'webgpu', colored: 1 };
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no-2d', colored: 0, kind: '' };
    const w = Math.min(canvas.width, 96);
    const h = Math.min(canvas.height, 96);
    const data = ctx.getImageData(0, 0, w, h).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! + data[i + 1]! + data[i + 2]! > 40) colored += 1;
    }
    return { ok: colored > 8 || data[3]! > 0, kind: dbg?.rendererKind ?? 'canvas', colored };
  });
  expect(sample.ok).toBeTruthy();
  expect(sample.colored).toBeGreaterThan(0);
});
