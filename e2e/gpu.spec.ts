import { expect, test } from '@playwright/test';

test('GPU renderer initialises or the fallback notice is shown', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  const notice = await page.locator('.notice').first().textContent();
  expect(notice === 'SDF renderer' || notice === 'Canvas fallback').toBeTruthy();
  const sample = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas#game') as HTMLCanvasElement;
    if (!canvas) return { ok: false, reason: 'no-canvas' };
    if (canvas.getContext('webgpu')) {
      return { ok: true, kind: 'webgpu' };
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no-2d' };
    const data = ctx.getImageData(8, 8, 1, 1).data;
    return { ok: data[3]! > 0, kind: 'canvas' };
  });
  expect(sample.ok).toBeTruthy();
});
