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

test('late-join snapshot restores a client interpolation view', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  await host.goto('/?signal=ws://127.0.0.1:8787');
  await guest.goto('/?signal=ws://127.0.0.1:8787');
  await host.getByRole('button', { name: 'Online' }).click();
  await guest.getByRole('button', { name: 'Online' }).click();
  await host.locator('#room').fill('SNAP01');
  await guest.locator('#room').fill('SNAP01');
  await Promise.all([
    host.getByRole('button', { name: 'Host' }).click(),
    guest.getByRole('button', { name: 'Join' }).click(),
  ]);
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 20_000 });
  await expect(guest.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 20_000 });
  await host.getByRole('button', { name: 'Start match' }).click();
  await expect.poll(async () => guest.evaluate(() => window.__floppy?.clientRestored ?? false), { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => guest.evaluate(() => window.__floppy?.lastSnapTick ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(async () => guest.evaluate(() => window.__floppy?.clientViewTick ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
  const x = await guest.evaluate(() => window.__floppy?.clientAppliedX ?? 0);
  expect(Number.isFinite(x)).toBe(true);
  await hostCtx.close();
  await guestCtx.close();
});

test('four localhost peers connect; 100ms/2% shaping still delivers chat', async ({ browser }) => {
  const ctxs = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const pages = await Promise.all(ctxs.map((c) => c.newPage()));
  const [host, g1, g2, g3] = pages;
  const room = 'FOURP1';
  for (const p of pages) {
    await p.goto(`/?signal=ws://127.0.0.1:8787&net=100,2`);
    await p.getByRole('button', { name: 'Online' }).click();
    await p.locator('#room').fill(room);
  }
  await host.getByRole('button', { name: 'Host' }).click();
  await g1.getByRole('button', { name: 'Join' }).click();
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 25_000 });
  await expect(g1.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 25_000 });
  await g2.getByRole('button', { name: 'Join' }).click();
  await expect(g2.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 25_000 });
  await g3.getByRole('button', { name: 'Join' }).click();
  await expect(g3.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', { timeout: 25_000 });
  await expect.poll(async () => host.evaluate(() => window.__floppy?.netPeers ?? 0), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await g1.locator('#chat').fill('peer-one');
  await g1.getByRole('button', { name: 'Send' }).click();
  await g2.locator('#chat').fill('peer-two');
  await g2.getByRole('button', { name: 'Send' }).click();
  await g3.locator('#chat').fill('peer-three');
  await g3.getByRole('button', { name: 'Send' }).click();
  await expect(host.locator('text=peer-one')).toBeVisible({ timeout: 15_000 });
  await expect(host.locator('text=peer-two')).toBeVisible({ timeout: 15_000 });
  await expect(host.locator('text=peer-three')).toBeVisible({ timeout: 15_000 });
  await Promise.all(ctxs.map((c) => c.close()));
});
