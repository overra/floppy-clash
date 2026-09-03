import { expect, test } from '@playwright/test';

test('boots, joins with keyboard, starts a local match vs bots', async ({ page }) => {
  await page.addInitScript(() => {
    const pads: Gamepad[] = [];
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => pads,
    });
  });
  await page.goto('/');
  await expect(page.locator('text=Floppy Clash')).toBeVisible();
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();
  const pixels = await page.evaluate(() => {
    const c = document.querySelector('canvas#game') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, Math.min(c.width, 64), Math.min(c.height, 64)).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 30) colored += 1;
    return colored;
  });
  expect(pixels).toBeGreaterThan(10);
});

test('settings and editor screens open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('text=Settings')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  await page.getByRole('button', { name: 'Add at 12,6' }).click();
  await expect(page.locator('#edjson')).toContainText('solid');
});
