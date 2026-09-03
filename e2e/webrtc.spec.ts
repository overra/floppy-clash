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
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
  await expect(guest.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
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
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
  await expect(guest.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
  await host.getByRole('button', { name: 'Start match' }).click();
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.clientRestored ?? false), {
      timeout: 20_000,
    })
    .toBe(true);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapTick ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapBytes ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(20);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapBinary ?? false), {
      timeout: 10_000,
    })
    .toBe(true);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapWireBytes ?? 0), {
      timeout: 10_000,
    })
    .toBeGreaterThan(20);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.clientViewTick ?? 0), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  const x = await guest.evaluate(() => window.__floppy?.clientAppliedX ?? 0);
  expect(Number.isFinite(x)).toBe(true);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.netSlot ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect(host.locator('#matchchat')).toBeVisible();
  await expect
    .poll(async () => host.evaluate(() => Boolean(window.__floppy?.sendMatchChat)), {
      timeout: 10_000,
    })
    .toBe(true);
  await host.evaluate(() => window.__floppy?.sendMatchChat('ingame-hi'));
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastChat ?? ''), { timeout: 15_000 })
    .toMatch(/ingame-hi/);
  await expect(guest.locator('#matchchat')).toContainText('ingame-hi', { timeout: 10_000 });
  const slot = await guest.evaluate(() => window.__floppy?.netSlot ?? 0);
  expect(slot).toBeGreaterThan(0);
  const x0 = await host.evaluate((s) => window.__floppy?.playerXs?.[s] ?? 0, slot);
  await guest.evaluate(() => window.__floppy?.holdInput({ moveX: 1, aimX: 1, aimY: 0 }));
  await expect
    .poll(async () => host.evaluate((s) => window.__floppy?.playerXs?.[s] ?? 0, slot), {
      timeout: 15_000,
    })
    .toBeGreaterThan(x0 + 0.25);
  await expect
    .poll(async () => host.evaluate(() => window.__floppy?.lastInputBundleLen ?? 0), {
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(1);
  await guest.evaluate(() => window.__floppy?.clearInput());
  await hostCtx.close();
  await guestCtx.close();
});

test('four localhost peers connect; 100ms/2% shaping still delivers chat', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxs = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const pages = await Promise.all(ctxs.map((c) => c.newPage()));
  const host = pages[0]!;
  const g1 = pages[1]!;
  const g2 = pages[2]!;
  const g3 = pages[3]!;
  const room = 'FOURP1';
  for (const p of pages) {
    await p.goto(`/?signal=ws://127.0.0.1:8787&net=100,2`);
    await p.getByRole('button', { name: 'Online' }).click();
    await p.locator('#room').fill(room);
  }
  await host.getByRole('button', { name: 'Host' }).click();
  await g1.getByRole('button', { name: 'Join' }).click();
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 25_000,
  });
  await expect(g1.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 25_000,
  });
  await g2.getByRole('button', { name: 'Join' }).click();
  await expect(g2.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 25_000,
  });
  await g3.getByRole('button', { name: 'Join' }).click();
  await expect(g3.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 25_000,
  });
  await expect
    .poll(async () => host.evaluate(() => window.__floppy?.netPeers ?? 0), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(3);
  await expect
    .poll(async () => g3.evaluate(() => window.__floppy?.netReady ?? false), { timeout: 10_000 })
    .toBe(true);
  const send = async (page: typeof g1, text: string) => {
    await page.locator('#chat').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
  };
  await send(g1, 'peer-one');
  await send(g2, 'peer-two');
  await send(g3, 'peer-three');
  const seen = async (needle: string) =>
    host.evaluate((n) => document.body.innerText.includes(n), needle);
  for (const [page, text] of [
    [g1, 'peer-one'],
    [g2, 'peer-two'],
    [g3, 'peer-three'],
  ] as const) {
    await expect
      .poll(
        async () => {
          if (await seen(text)) return true;
          await send(page, text);
          return seen(text);
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  }
  await host.getByRole('button', { name: 'Start match' }).click();
  await expect(host.locator('canvas#game')).toBeVisible({ timeout: 15_000 });
  await host.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 20_000 });
  await host.evaluate(() => window.__floppy?.speedRounds());
  for (let r = 0; r < 10; r++) {
    await host.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
    await host.evaluate(() => window.__floppy?.forceLastStand());
    await host.waitForFunction(
      (n) => (window.__floppy?.matchRound ?? 0) > n,
      r,
      { timeout: 15_000 },
    );
  }
  const rounds = await host.evaluate(() => window.__floppy?.matchRound ?? 0);
  expect(rounds).toBeGreaterThanOrEqual(10);
  const hostLevel = await host.evaluate(() => window.__floppy?.lastLevelId ?? '');
  expect(hostLevel.length).toBeGreaterThan(0);
  for (const guest of [g1, g2, g3]) {
    await expect
      .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapBinary ?? false), {
        timeout: 15_000,
      })
      .toBe(true);
    await expect
      .poll(async () => guest.evaluate(() => window.__floppy?.clientRestored ?? false), {
        timeout: 10_000,
      })
      .toBe(true);
    await expect
      .poll(async () => guest.evaluate(() => window.__floppy?.lastLevelId ?? ''), {
        timeout: 10_000,
      })
      .toBe(hostLevel);
  }
  await Promise.all(ctxs.map((c) => c.close()));
});

test('host custom level JSON is applied on the client sim', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  await host.goto('/?signal=ws://127.0.0.1:8787');
  await guest.goto('/?signal=ws://127.0.0.1:8787');
  await host.getByRole('button', { name: 'Online' }).click();
  await guest.getByRole('button', { name: 'Online' }).click();
  await host.locator('#room').fill('LVL01');
  await guest.locator('#room').fill('LVL01');
  await Promise.all([
    host.getByRole('button', { name: 'Host' }).click(),
    guest.getByRole('button', { name: 'Join' }).click(),
  ]);
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
  await expect(guest.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
  await expect
    .poll(async () => host.evaluate(() => Boolean(window.__floppy?.loadLevel)), { timeout: 10_000 })
    .toBe(true);
  const loaded = await host.evaluate(() =>
    window.__floppy?.loadLevel({
      id: 'e2e-custom',
      name: 'E2E Custom',
      theme: 'arena',
      bounds: { x: 0, y: 0, w: 36, h: 16 },
      spawns: [
        { x: 4, y: 8 },
        { x: 32, y: 8 },
        { x: 10, y: 8 },
        { x: 26, y: 8 },
      ],
      objects: [{ type: 'solid', x: 18, y: 1, w: 36, h: 2 }],
    }),
  );
  expect(loaded).toBe('e2e-custom');
  await host.getByRole('button', { name: 'Start match' }).click();
  await expect
    .poll(async () => host.evaluate(() => window.__floppy?.lastLevelId ?? ''), { timeout: 20_000 })
    .toBe('e2e-custom');
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastLevelId ?? ''), { timeout: 20_000 })
    .toBe('e2e-custom');
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.clientRestored ?? false), {
      timeout: 20_000,
    })
    .toBe(true);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapBinary ?? false), {
      timeout: 10_000,
    })
    .toBe(true);
  await hostCtx.close();
  await guestCtx.close();
});

test('guest joining after the match started gets a binary late-join snapshot', async ({
  browser,
}) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  await host.goto('/?signal=ws://127.0.0.1:8787');
  await host.getByRole('button', { name: 'Online' }).click();
  await host.locator('#room').fill('LATE01');
  await host.getByRole('button', { name: 'Host' }).click();
  await expect(host.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
  await host.getByRole('button', { name: 'Start match' }).click();
  await expect(host.locator('canvas#game')).toBeVisible({ timeout: 15_000 });
  await host.waitForFunction(() => (window.__floppy?.tick ?? 0) > 8, null, { timeout: 15_000 });
  await guest.goto('/?signal=ws://127.0.0.1:8787');
  await guest.getByRole('button', { name: 'Online' }).click();
  await guest.locator('#room').fill('LATE01');
  await guest.getByRole('button', { name: 'Join' }).click();
  await expect(guest.locator('#netstatus')).toHaveAttribute('data-net-state', 'up', {
    timeout: 20_000,
  });
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.clientRestored ?? false), {
      timeout: 20_000,
    })
    .toBe(true);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapBinary ?? false), {
      timeout: 10_000,
    })
    .toBe(true);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.lastSnapTick ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  const hostX = await host.evaluate(() => window.__floppy?.playerXs?.[0] ?? 0);
  const guestX = await guest.evaluate(() => window.__floppy?.clientAppliedX ?? 0);
  expect(Number.isFinite(hostX)).toBe(true);
  expect(Number.isFinite(guestX)).toBe(true);
  expect(Math.abs(guestX - hostX)).toBeLessThan(4);
  await expect
    .poll(async () => guest.evaluate(() => window.__floppy?.netSlot ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  const slot = await guest.evaluate(() => window.__floppy?.netSlot ?? 0);
  const x0 = await host.evaluate((s) => window.__floppy?.playerXs?.[s] ?? 0, slot);
  await guest.evaluate(() => window.__floppy?.holdInput({ moveX: 1, aimX: 1, aimY: 0 }));
  await expect
    .poll(async () => host.evaluate((s) => window.__floppy?.playerXs?.[s] ?? 0, slot), {
      timeout: 15_000,
    })
    .toBeGreaterThan(x0 + 0.2);
  await guest.evaluate(() => window.__floppy?.clearInput());
  await hostCtx.close();
  await guestCtx.close();
});
