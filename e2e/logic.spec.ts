import { expect, test } from '@playwright/test';

test('boots, joins with keyboard, starts a local match vs bots', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [pad],
    });
  });
  await page.goto('/');
  await expect(page.locator('text=Floppy Clash')).toBeVisible();
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.waitForTimeout(800);
  }
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
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
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await page.evaluate(() => window.__floppy?.forceLastStand());
  await expect(page.locator('[data-round-over]')).toBeVisible({ timeout: 15_000 });
});

test('settings persist toggles and editor property panel opens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('text=Settings')).toBeVisible();
  await expect(page.locator('text=Weapon toggles')).toBeVisible();
  await expect(page.locator('text=Per-pad remap')).toBeVisible();
  await page.locator('#lit').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#lit')).toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  await page.getByRole('button', { name: 'spawn' }).click();
  await page.getByRole('button', { name: 'Add at 12,6' }).click();
  await expect(page.locator('#edjson')).toContainText('spawns');
  await expect(page.locator('#edfields')).toBeVisible();
});

test('online lobby has room code and chat', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Online' }).click();
  await expect(page.getByRole('heading', { name: 'Online lobby' })).toBeVisible();
  await page.locator('#room').fill('TEST01');
  await page.locator('#chat').fill('hello couch');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('text=hello couch')).toBeVisible();
  await page.getByRole('button', { name: 'Host' }).click();
  await expect(page.locator('#room')).toHaveValue(/TEST01/i);
});
