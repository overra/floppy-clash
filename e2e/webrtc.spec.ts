import { expect, test } from '@playwright/test';

test('two pages exchange chat over localhost WebRTC', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  await host.goto('/?signal=ws://127.0.0.1:8787');
  await guest.goto('/?signal=ws://127.0.0.1:8787');
  await host.getByRole('button', { name: 'Online' }).click();
  await guest.getByRole('button', { name: 'Online' }).click();
  await host.locator('#room').fill('E2E42');
  await guest.locator('#room').fill('E2E42');
  await Promise.all([
    host.getByRole('button', { name: 'Host' }).click(),
    guest.getByRole('button', { name: 'Join' }).click(),
  ]);
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 20_000 });
  await expect(guest.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 20_000 });
  await host.locator('#chat').fill('hello webrtc');
  await host.getByRole('button', { name: 'Send' }).click();
  await expect(guest.locator('text=hello webrtc')).toBeVisible({ timeout: 10_000 });
  await expect(guest.locator('#netstatus')).toHaveAttribute('data-net-role', 'client');
  await hostCtx.close();
  await guestCtx.close();
});
