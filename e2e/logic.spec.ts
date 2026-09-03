import { expect, test, type Page } from '@playwright/test';

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
  // Starting is async (the level library loads first); if Enter did not take, fall back to Start.
  const join = page.getByRole('heading', { name: 'Join' });
  const started = await join.waitFor({ state: 'hidden', timeout: 3_000 }).then(
    () => true,
    () => false,
  );
  if (!started) await page.getByRole('button', { name: 'Start' }).click();
  // The countdown only lasts a second and a half, so look for it before anything slower.
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
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
  await page.waitForFunction(() => (window.__floppy?.phase ?? 0) >= 2, null, { timeout: 15_000 });
  await page.evaluate(() => window.__floppy?.forceLastStand());
  await expect(page.locator('[data-round-over]')).toBeVisible({ timeout: 15_000 });
});

/** A controllable fake controller in navigator.getGamepads(); the page polls it every frame. */
async function installFakePad(page: Page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
}

/** Press and release one button, holding it across a few frames so the poll sees the edge. */
async function tap(page: Page, button: number) {
  await page.evaluate(async (b) => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad;
    const frames = (n: number) =>
      new Promise<void>((resolve) => {
        const step = (k: number) => {
          if (k <= 0) resolve();
          else requestAnimationFrame(() => step(k - 1));
        };
        step(n);
      });
    pad.buttons[b]!.pressed = true;
    pad.buttons[b]!.value = 1;
    await frames(3);
    pad.buttons[b]!.pressed = false;
    pad.buttons[b]!.value = 0;
    await frames(3);
  }, button);
}

const PAD = { A: 0, B: 1, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

test('a lone gamepad gets from the title through a match, pause and back to the menu without keyboard or mouse', async ({ page }) => {
  await installFakePad(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();

  // A on the title picks the highlighted "Solo vs Bots" and seats the pad, readied, with three bots.
  await tap(page, PAD.A);
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  const seat0 = page.locator('[data-seat="0"]');
  await expect(seat0).toHaveAttribute('data-taken', '1');
  await expect(seat0).toHaveAttribute('data-ready', '1');
  await expect(seat0.locator('.seat-pad')).toHaveText('Xbox Wireless Controller');
  await expect(page.locator('[data-bot="1"]')).toHaveCount(3);

  // D-pad: down/up trims and restores the bot count, right picks the next free color.
  await tap(page, PAD.DOWN);
  await expect(page.locator('#cycle-bots')).toHaveText('Bots: 2');
  await expect(page.locator('[data-bot="1"]')).toHaveCount(2);
  await tap(page, PAD.UP);
  await expect(page.locator('#cycle-bots')).toHaveText('Bots: 3');
  await tap(page, PAD.RIGHT);
  await expect(seat0.locator('.seat-name')).toContainText('Blue');

  // Start begins the match; the pad, not the keyboard, steers slot 0.
  await tap(page, PAD.START);
  await expect(page.getByRole('heading', { name: 'Join' })).toBeHidden({ timeout: 8_000 });
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  const before = await page.evaluate(() => window.__floppy!.players[0]!.x);
  await page.evaluate(() => {
    (window as unknown as { __pad: { axes: number[] } }).__pad.axes[0] = 1;
  });
  await page.waitForFunction((x0) => (window.__floppy?.players[0]?.x ?? x0) > x0 + 0.5, before, { timeout: 5_000 });
  await page.evaluate(() => {
    (window as unknown as { __pad: { axes: number[] } }).__pad.axes[0] = 0;
  });
  await expect(page.evaluate(() => window.__floppy!.players[0]!.color)).resolves.toBe(1);

  // Start pauses, B resumes, Start again and the cursor sits on Resume: right + A quits to the title.
  await tap(page, PAD.START);
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await tap(page, PAD.B);
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeHidden();
  await tap(page, PAD.START);
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveClass(/pad-focus/);
  await tap(page, PAD.RIGHT);
  await expect(page.getByRole('button', { name: 'Quit' })).toHaveClass(/pad-focus/);
  await tap(page, PAD.A);
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();
});

test('local play joins on first Space and readies on the second', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#localstats')).toContainText('matches');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-seat="0"]')).toContainText(/joined/i);
  await expect(page.locator('[data-seat="0"]')).not.toHaveAttribute('data-ready', '1');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
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
