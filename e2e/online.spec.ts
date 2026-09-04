import { expect, test, type Page } from '@playwright/test';

/**
 * Two browsers, one room, through the real relay (`wrangler dev`, proxied by the preview server):
 * host, join by invite link, chat, start, stay in sync, steer from the client, end, leave.
 */

async function openLobby(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Online' }).click();
  await expect(page.getByRole('heading', { name: 'Online' })).toBeVisible();
  await page.locator('#name').fill(name);
}

test('two browsers meet in a room, play a synced match and part ways', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await (await browser.newContext()).newPage();
  const client = await (await browser.newContext()).newPage();
  for (const p of [host, client]) p.on('pageerror', (err) => console.error('page error:', err));

  // A code no earlier run can still be holding.
  const code = `E2E${Date.now().toString(36).slice(-4).toUpperCase()}`;
  await openLobby(host, 'Hosty');
  await host.locator('#room').fill(code);
  await host.getByRole('button', { name: 'Host' }).click();
  await expect(host.locator('#room-code')).toHaveText(code, { timeout: 15_000 });
  await expect(host.locator('[data-seat="0"]')).toHaveAttribute('data-taken', '1');
  await expect(host.locator('[data-seat="0"] .seat-status')).toHaveText('HOST');
  await expect(host.locator('#share-url')).toContainText(`?room=${code}`);

  // The client arrives through the invite link.
  await client.goto(`/?room=${code.toLowerCase()}`);
  await expect(client.locator('#room')).toHaveValue(code);
  await client.locator('#name').fill('Clienty');
  await client.locator('#join-room').click();
  await expect(client.locator('#room-code')).toHaveText(code, { timeout: 15_000 });
  await expect(client.locator('[data-seat="1"]')).toHaveAttribute('data-taken', '1');
  await expect(client.locator('[data-seat="1"] .seat-status')).toHaveText('YOU');
  await expect(host.locator('[data-seat="1"] .seat-name')).toHaveText('Clienty');
  await expect(client.getByRole('button', { name: 'Start' })).toHaveCount(0);

  // Chat travels both ways.
  await host.locator('#chat').fill('hello from the host');
  await host.locator('#chat').press('Enter');
  await expect(client.locator('.chat-log')).toContainText('Hosty: hello from the host');
  await client.locator('#chat').fill('hi back');
  await client.locator('#chat').press('Enter');
  await expect(host.locator('.chat-log')).toContainText('Clienty: hi back');

  // The host deals the match; both browsers count down, and the client's mirror keeps agreeing with
  // the host's world hash.
  await host.getByRole('button', { name: 'Start' }).click();
  await expect(host.locator('[data-countdown]')).toBeVisible({ timeout: 10_000 });
  await expect(client.locator('[data-countdown]')).toBeVisible({ timeout: 10_000 });
  await client.waitForFunction(() => (window.__floppy?.online?.lastHashOk ?? 0) >= 120, null, {
    timeout: 20_000,
  });
  const status = await client.evaluate(() => window.__floppy!.online);
  expect(status).toMatchObject({ role: 'client', localSlot: 1, inMatch: true, desync: false });
  expect(await host.evaluate(() => window.__floppy!.online)).toMatchObject({
    role: 'host',
    localSlot: 0,
    inMatch: true,
  });

  // The client's keyboard steers fighter 1 in the host's world.
  await host.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  const before = await host.evaluate(() => window.__floppy!.players.find((p) => p.slot === 1)!.x);
  await client.keyboard.down('d');
  await host.waitForFunction(
    (x0) => (window.__floppy?.players.find((p) => p.slot === 1)?.x ?? x0) > x0 + 0.5,
    before,
    { timeout: 8_000 },
  );
  await client.keyboard.up('d');

  // The host ends the match from the pause card: everyone is back in the lobby, still connected.
  await host.keyboard.press('Escape');
  await host.getByRole('button', { name: 'End match' }).click();
  await expect(host.locator('#room-code')).toHaveText(code);
  await expect(client.locator('#room-code')).toHaveText(code, { timeout: 10_000 });
  await expect(client.locator('.chat-log')).toContainText('match over');

  // The host leaves; the client learns the room is gone.
  await host.getByRole('button', { name: 'Leave' }).click();
  await expect(host.getByRole('heading', { name: 'Online' })).toBeVisible();
  await expect(client.getByText('The host left the room.')).toBeVisible({ timeout: 10_000 });
});

test('joining a room nobody hosts is refused with a reason', async ({ page }) => {
  await openLobby(page, 'Lonely');
  await page.locator('#room').fill('NOBODY');
  await page.locator('#join-room').click();
  await expect(page.getByText('No room with that code is open right now.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('#room')).toHaveValue('NOBODY');
});
