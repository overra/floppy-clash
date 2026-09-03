import { expect, test } from '@playwright/test';

test.use({ video: 'on', screenshot: { mode: 'on' } });

test('records a headed couch-play walkthrough', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();
  await expect(page.locator('#brand-logo')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('text=Weapon toggles')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await page.keyboard.press('F3');
  await expect(page.locator('pre', { hasText: 'hash' })).toBeVisible();
  await expect(page.locator('pre', { hasText: 'traits' })).toBeVisible();
  await page.screenshot({ path: 'test-results/walkthrough-play.png', fullPage: true });
});
