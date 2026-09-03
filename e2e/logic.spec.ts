import { expect, test, type Page } from '@playwright/test';

const FLAT_ARENA = {
  id: 'e2e-flat',
  name: 'E2E Flat',
  theme: 'woods',
  bounds: { x: 0, y: 0, w: 32, h: 18 },
  killMargin: 6,
  spawns: [
    { x: 8, y: 4 },
    { x: 16, y: 4 },
    { x: 12, y: 4 },
    { x: 20, y: 4 },
  ],
  drops: { enabled: false, xMin: 4, xMax: 28, intervalScale: 1 },
  objects: [
    { type: 'solid', x: 16, y: 1, w: 32, h: 2 },
    { type: 'solid', x: 0.5, y: 9, w: 1, h: 18 },
    { type: 'solid', x: 31.5, y: 9, w: 1, h: 18 },
  ],
};

async function loadFlatArena(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__floppy?.loadLevel));
  const id = await page.evaluate((level) => window.__floppy?.loadLevel(level), FLAT_ARENA);
  expect(id).toBe('e2e-flat');
}

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
  await loadFlatArena(page);
  await expect(page.locator('text=Floppy Clash')).toBeVisible();
  await expect(page.locator('#brand-logo')).toBeVisible();
  await expect(page.locator('#brand-logo')).toHaveAttribute('alt', 'Floppy Clash');
  await expect(page.locator('#brand-logo')).toHaveAttribute('src', '/favicon.svg');
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
  await page.waitForFunction(() => Boolean(window.__floppy?.configureMatch), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.__floppy?.configureMatch?.({ maxHp: 1, enabledWeapons: [] });
    window.__floppy?.speedRounds();
  });
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.matchRound ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await expect(page.locator('[data-round-over]')).toBeVisible({ timeout: 8_000 });
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.fistKills ?? 0), { timeout: 5_000 })
    .toBeGreaterThan(0);
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

test('editor pad D-pad nudges the selection', async ({ page }) => {
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
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  const before = await page.locator('#edjson').innerText();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[15]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[15]!.pressed = false;
  });
  await expect.poll(async () => page.locator('#edjson').innerText()).not.toBe(before);
});

test('editor can place every hazard type then playtest the draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  const tools = [
    'solid',
    'spikes',
    'lava',
    'saw',
    'crate',
    'ice',
    'conveyor',
    'bounce',
    'platform.moving',
    'platform.rotating',
    'platform.disappearing',
    'platform.collapsing',
    'platform.momentum',
    'laser',
    'barrel.explosive',
    'block.destructible',
    'chain',
    'spikeball',
    'crusher',
    'trigger.drop',
    'boss',
  ];
  for (const tool of tools) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    await page.getByRole('button', { name: 'Add at 12,6' }).click();
  }
  const json = await page.locator('#edjson').innerText();
  for (const tool of tools) {
    expect(json).toContain(`"type": "${tool}"`);
  }
  await page.getByRole('button', { name: 'Share URL' }).click();
  const hash = await page.evaluate(() => location.hash);
  expect(hash.startsWith('#l=')).toBe(true);
  expect(hash.slice(3)).not.toMatch(/[+/]/);
  await page.reload();
  await expect(page.locator('text=Level Editor')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('#edjson')).toContainText('"type": "spikes"');
  await page.getByRole('button', { name: 'Playtest' }).click();
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
});

test('settings persist toggles and editor property panel opens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('text=Settings')).toBeVisible();
  await expect(page.locator('text=Weapon toggles')).toBeVisible();
  await expect(page.locator('text=Oracle Pistol')).toBeVisible();
  await expect(page.locator('text=Void Well')).toBeVisible();
  await expect(page.locator('text=Hand Cannon')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('God Pistol');
  await expect(page.locator('body')).not.toContainText('Black Hole');
  await expect(page.locator('body')).not.toContainText('Deagle');
  await expect(page.locator('body')).not.toContainText('Uzi');
  await expect(page.locator('body')).not.toContainText('AK-47');
  await expect(page.locator('#hp')).toHaveValue('100');
  await expect(page.locator('#arms')).toBeVisible();
  await expect(page.locator('text=Per-pad remap')).toBeVisible();
  await page.locator('#lit').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#lit')).toBeChecked();
  await expect(page.locator('#userlevels')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'User levels' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  await page.getByRole('button', { name: 'Save library' }).click();
  await expect(page.locator('#edlib')).toContainText(/Untitled|user-draft/i);
  await page.reload();
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('#edlib')).toContainText(/Untitled|user-draft/i);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#userlevels')).toContainText(/Untitled|user-draft/i);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await page.getByRole('button', { name: 'spawn' }).click();
  await page.getByRole('button', { name: 'Add at 12,6' }).click();
  await expect(page.locator('#edjson')).toContainText('spawns');
  await expect(page.locator('#edfields')).toBeVisible();
});

test('editor playtest starts a match from the draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  await page.getByRole('button', { name: 'Playtest' }).click();
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Quit' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('#edjson')).toContainText('"type": "solid"');
});

test('F3 debug HUD and F1 overlay flags are wired', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await page.keyboard.press('F3');
  await page.keyboard.press('F1');
  await page.waitForTimeout(200);
  const flags = await page.evaluate(() => ({
    hud: window.__floppy?.debugHud,
    draw: window.__floppy?.debugDraw,
  }));
  expect(flags.hud).toBe(true);
  expect(flags.draw).toBe(true);
  await expect(page.locator('pre', { hasText: 'hash' })).toBeVisible();
  await expect(page.locator('pre', { hasText: 'traits' })).toBeVisible();
  const inspect = await page.evaluate(() => window.__floppy?.inspect ?? '');
  expect(inspect).toMatch(/Player|NetId|#\d+/);
});

test('F4–F9 spawn, kill, slow-mo, freeze, renderer-switch, replay-download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  const beforeWeapons = await page.evaluate(() => window.__floppy?.weaponCount ?? 0);
  await page.keyboard.press('F4');
  await page.waitForFunction(
    (n) => (window.__floppy?.weaponCount ?? 0) > n,
    beforeWeapons,
    { timeout: 5_000 },
  );
  const slowBefore = await page.evaluate(() => window.__floppy?.slowmo);
  await page.keyboard.press('F6');
  await page.waitForFunction((prev) => window.__floppy?.slowmo !== prev, slowBefore, { timeout: 3_000 });
  await page.keyboard.press('F7');
  await page.waitForFunction(() => window.__floppy?.freezeCam === true, null, { timeout: 3_000 });
  const switches = await page.evaluate(() => window.__floppy?.rendererSwitches ?? 0);
  await page.keyboard.press('F8');
  await page.waitForFunction((n) => (window.__floppy?.rendererSwitches ?? 0) > n, switches, { timeout: 5_000 });
  const kind = await page.evaluate(() => window.__floppy?.rendererKind);
  expect(kind === 'gpu' || kind === 'canvas').toBe(true);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8_000 }),
    page.keyboard.press('F9'),
  ]);
  expect(download.suggestedFilename()).toMatch(/replay-/);
  await page.waitForFunction(() => (window.__floppy?.lastReplayBytes ?? 0) > 0, null, { timeout: 3_000 });
  await page.keyboard.press('F5');
  await page.waitForFunction(() => (window.__floppy?.p0Hp ?? 1) <= 0, null, { timeout: 5_000 });
});

test('controller disconnect overlay pauses the match', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('gamepaddisconnected'));
  });
  await expect(page.getByRole('heading', { name: 'Controller disconnected' })).toBeVisible();
});

test('join left/right picks a seat color', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-seat="0"]')).toContainText(/Yellow/i);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-seat="0"]')).toContainText(/Blue/i);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-seat="0"]')).toContainText(/Yellow/i);
});

test('Escape opens the pause overlay and Resume continues', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0);
});

test('local 10-round fists-only match (PLAN M2 stand-in)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const mk = (id: string, index: number) => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      return {
        id,
        index,
        connected: true,
        mapping: 'standard' as const,
        axes: [0, 0, 0, 0],
        buttons,
        timestamp: 1,
        hapticActuators: [],
        vibrationActuator: null,
      };
    };
    const pads = [mk('e2e-fist-0', 0), mk('e2e-fist-1', 1), mk('e2e-fist-2', 2), mk('e2e-fist-3', 3)];
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    (window as unknown as { __e2ePads: typeof pads }).__e2ePads = pads;
  });
  await page.goto('/');
  await loadFlatArena(page);
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: Gamepad[] }).__e2ePads;
    for (const pad of pads) {
      window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
    }
  });
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="3"]')).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => Boolean(window.__floppy?.configureMatch), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.__floppy?.configureMatch?.({ maxHp: 1, enabledWeapons: [] });
    window.__floppy?.speedRounds();
    window.__floppy?.armLiveFists();
  });
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.matchRound ?? 0), { timeout: 160_000 })
    .toBeGreaterThanOrEqual(10);
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.fistKills ?? 0), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(10);
  await page.evaluate(() => window.__floppy?.disarmLiveFists());
});

test('scoreboard overlay appears after last stand', async ({ page }) => {
  await page.goto('/');
  await loadFlatArena(page);
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForFunction(() => Boolean(window.__floppy?.configureMatch), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.__floppy?.configureMatch?.({ maxHp: 1, enabledWeapons: [] });
    window.__floppy?.speedRounds();
  });
  await expect(page.locator('[data-round-over]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /Round over|Last standing/ })).toBeVisible();
  // Appendix A scoreboard is 90 ticks (~1.5s). A 2-tick cheat would already be gone.
  await page.waitForTimeout(400);
  await expect(page.locator('[data-round-over]')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.fistKills ?? 0), { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test('per-pad remap persists in localStorage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#padid').fill('e2e-pad');
  await page.locator('#map-jump').fill('2');
  await page.getByRole('button', { name: 'Save remap' }).click();
  const stored = await page.evaluate(() => localStorage.getItem('floppy-clash.padmaps'));
  expect(stored).toContain('e2e-pad');
  expect(stored).toContain('"jump":2');
});

test('F10 replay loader accepts a seed+input tape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  const tape = JSON.stringify({
    seed: 44,
    levelId: 'gym',
    inputs: Array.from({ length: 12 }, () => [
      { moveX: 1, jump: false, down: false, attack: false, block: false, throw: false, aimX: 1, aimY: 0 },
      { moveX: 0, jump: false, down: false, attack: false, block: false, throw: false, aimX: 1, aimY: 0 },
      { moveX: 0, jump: false, down: false, attack: false, block: false, throw: false, aimX: 1, aimY: 0 },
      { moveX: 0, jump: false, down: false, attack: false, block: false, throw: false, aimX: 1, aimY: 0 },
    ]),
  });
  const ok = await page.evaluate((json) => window.__floppy?.loadReplay?.(json) ?? false, tape);
  expect(ok).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.__floppy?.replayLoaded ?? false)).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.__floppy?.tick ?? 0)).toBeGreaterThanOrEqual(12);
});

test('service worker registers for PWA offline cache', async ({ page }) => {
  await page.goto('/');
  const state = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no-sw';
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state ?? reg.installing?.state ?? 'missing';
  });
  expect(['activated', 'activating', 'installed']).toContain(state);
});

test('four injected pads join, pick colors, ready, and start', async ({ page }) => {
  await page.addInitScript(() => {
    const mk = (id: string, index: number) => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      return {
        id,
        index,
        connected: true,
        mapping: 'standard' as const,
        axes: [0, 0, 0, 0],
        buttons,
        timestamp: 1,
        hapticActuators: [],
        vibrationActuator: null,
      };
    };
    const pads = [
      mk('e2e-pad-0', 0),
      mk('e2e-pad-1', 1),
      mk('e2e-pad-2', 2),
      mk('e2e-pad-3', 3),
    ];
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    (window as unknown as { __e2ePads: typeof pads }).__e2ePads = pads;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: Gamepad[] }).__e2ePads;
    for (const pad of pads) {
      window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
    }
  });
  await expect(page.locator('[data-seat="0"]')).toContainText(/joined/i);
  await expect(page.locator('[data-seat="3"]')).toContainText(/joined/i);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[0]!.buttons[15]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[0]!.buttons[15]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toContainText(/Blue/i);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('[data-seat="1"]')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('[data-seat="2"]')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('[data-seat="3"]')).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await expect.poll(async () => page.evaluate(() => window.__floppy?.playerColors?.[0])).toBe(1);
});

test('same-id pad reconnect resumes play after disconnect overlay', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-reconnect-pad',
      index: 0,
      connected: true,
      mapping: 'standard' as const,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: pad }));
  });
  await expect(page.getByRole('heading', { name: 'Controller disconnected' })).toBeVisible();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await expect(page.getByRole('heading', { name: 'Controller disconnected' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0);
  await expect(page.locator('canvas#game')).toBeVisible();
  // Resume is enough — a 1v1 bot match may already be on last-kill/scoreboard.
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.phase ?? 0))
    .toBeGreaterThanOrEqual(2);
  await expect.poll(async () => page.evaluate(() => window.__floppy?.playerColors?.[0])).toBe(0);
  const wins = await page.evaluate(() => window.__floppy?.matchWins ?? []);
  expect(wins.length).toBe(4);
});

test('HP preset 25 is the spawned match Health', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#hp')).toHaveValue('100');
  const opts = await page.locator('#hp option').allTextContents();
  expect(opts.map((s) => s.trim())).toEqual(expect.arrayContaining(['1', '25', '50', '100', '200']));
  await page.locator('#hp').selectOption('25');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  if (await page.getByRole('heading', { name: 'Join' }).isVisible()) {
    await page.getByRole('button', { name: 'Start' }).click();
  }
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await expect.poll(async () => page.evaluate(() => window.__floppy?.maxHp ?? 0)).toBe(25);
  await expect.poll(async () => page.evaluate(() => window.__floppy?.p0Hp ?? 0)).toBe(25);
});

test('pad Start pauses on the rising edge; hold does not resume; same pad resumes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const mk = (id: string, index: number) => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      return {
        id,
        index,
        connected: true,
        mapping: 'standard' as const,
        axes: [0, 0, 0, 0],
        buttons,
        timestamp: 1,
        hapticActuators: [],
        vibrationActuator: null,
      };
    };
    const pads = [mk('e2e-pause-a', 0), mk('e2e-pause-b', 1)];
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    (window as unknown as { __e2ePads: typeof pads }).__e2ePads = pads;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: Gamepad[] }).__e2ePads;
    for (const pad of pads) {
      window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
    }
  });
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[0]!.buttons[9]!.pressed = true;
  });
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__floppy?.pausedBy)).toBe('e2e-pause-a');
  await page.waitForTimeout(200);
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[1]!.buttons[9]!.pressed = true;
  });
  await page.waitForTimeout(120);
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[0]!.buttons[9]!.pressed = false;
    pads[1]!.buttons[9]!.pressed = false;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[0]!.buttons[9]!.pressed = true;
  });
  await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => window.__floppy?.pausedBy)).toBeNull();
});

test('non-standard pad on the menu opens remap with that pad id', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-nonstandard',
      index: 0,
      connected: true,
      mapping: '' as GamepadMappingType,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Floppy Clash' })).toBeVisible();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('.notice')).toContainText(/remap offered/i);
  await expect(page.locator('#padid')).toHaveValue('e2e-nonstandard');
  await expect(page.locator('[data-remap-pad]')).toHaveAttribute('data-remap-pad', 'e2e-nonstandard');
});

test('remap offer from Join returns to Join on Save and Back', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-join-remap',
      index: 0,
      connected: true,
      mapping: '' as GamepadMappingType,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('#padid')).toHaveValue('e2e-join-remap');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
});

test('four pads: seat 1 stick moves P2, not P1', async ({ page }) => {
  await page.addInitScript(() => {
    const mk = (id: string, index: number) => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      return {
        id,
        index,
        connected: true,
        mapping: 'standard' as const,
        axes: [0, 0, 0, 0],
        buttons,
        timestamp: 1,
        hapticActuators: [],
        vibrationActuator: null,
      };
    };
    const pads = [mk('e2e-route-0', 0), mk('e2e-route-1', 1), mk('e2e-route-2', 2), mk('e2e-route-3', 3)];
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    (window as unknown as { __e2ePads: typeof pads }).__e2ePads = pads;
  });
  await page.goto('/');
  await loadFlatArena(page);
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: Gamepad[] }).__e2ePads;
    for (const pad of pads) {
      window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
    }
  });
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = false;
  });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await expect.poll(async () => page.evaluate(() => window.__floppy?.lastLevelId ?? '')).toBe('e2e-flat');
  const before = await page.evaluate(() => ({
    x0: window.__floppy?.playerXs?.[0] ?? 0,
    x1: window.__floppy?.playerXs?.[1] ?? 0,
  }));
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { axes: number[] }[] }).__e2ePads;
    pads[1]!.axes[0] = 1;
  });
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.playerXs?.[1] ?? 0), { timeout: 8_000 })
    .toBeGreaterThan(before.x1 + 0.35);
  const after0 = await page.evaluate(() => window.__floppy?.playerXs?.[0] ?? 0);
  expect(Math.abs(after0 - before.x0)).toBeLessThan(0.35);
});

test('saved remap jump button makes the joined seat jump', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'floppy-clash.padmaps',
      JSON.stringify({ 'e2e-jump-pad': { jump: 2, attack: 7, block: 6, throw: 3, pause: 9 } }),
    );
    const mk = (id: string, index: number) => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      return {
        id,
        index,
        connected: true,
        mapping: 'standard' as const,
        axes: [0, 0, 0, 0],
        buttons,
        timestamp: 1,
        hapticActuators: [],
        vibrationActuator: null,
      };
    };
    // Two human seats so matchPlayerCount does not fill slot 1 with a punching bot.
    const pads = [mk('e2e-jump-pad', 0), mk('e2e-jump-other', 1)];
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    (window as unknown as { __e2ePads: typeof pads }).__e2ePads = pads;
  });
  await page.goto('/');
  await loadFlatArena(page);
  const stored = await page.evaluate(() => localStorage.getItem('floppy-clash.padmaps'));
  expect(stored).toContain('e2e-jump-pad');
  expect(stored).toContain('"jump":2');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: Gamepad[] }).__e2ePads;
    for (const pad of pads) {
      window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
    }
  });
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('[data-seat="1"]')).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await expect.poll(async () => page.evaluate(() => window.__floppy?.lastLevelId ?? '')).toBe('e2e-flat');
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.padMaps?.['e2e-jump-pad']?.jump ?? -1))
    .toBe(2);
  await page.waitForFunction(() => window.__floppy?.playerGrounded?.[0] === true, null, { timeout: 8_000 });
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[0]!.buttons[2]!.pressed = false;
  });
  await page.waitForTimeout(50);
  const y0 = await page.evaluate(() => window.__floppy?.playerYs?.[0] ?? 0);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    pads[0]!.buttons[2]!.pressed = true;
  });
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.lastSeatJumps?.[0] === true), { timeout: 4_000 })
    .toBe(true);
  await expect
    .poll(async () => page.evaluate(() => window.__floppy?.playerYs?.[0] ?? 0), { timeout: 8_000 })
    .toBeGreaterThan(y0 + 0.35);
});

test('Local Play after Solo vs Bots does not keep the leftover keyboard seat', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.locator('[data-seat="0"]')).toContainText(/keyboard|You/i);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Local Play' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await expect(page.locator('[data-seat="0"]')).toContainText(/empty/i);
});

test('same pad rejoins the remembered color after a fresh Local Play', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-memory-pad',
      index: 0,
      connected: true,
      mapping: 'standard' as const,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await expect(page.locator('[data-seat="0"]')).toContainText(/Yellow/i);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[15]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[15]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toContainText(/Blue/i);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.locator('[data-seat="0"]')).toContainText(/e2e-memory-pad/);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Local Play' }).click();
  await expect(page.locator('[data-seat="0"]')).toContainText(/e2e-memory-pad/);
  await expect(page.locator('[data-seat="0"]')).toContainText(/Blue/i);
});

test('first new pad claims the disconnected seat and keeps its color', async ({ page }) => {
  await page.addInitScript(() => {
    const mk = (id: string, index: number) => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      return {
        id,
        index,
        connected: true,
        mapping: 'standard' as const,
        axes: [0, 0, 0, 0],
        buttons,
        timestamp: 1,
        hapticActuators: [],
        vibrationActuator: null,
      };
    };
    const pads = [mk('e2e-claim-a', 0), mk('e2e-claim-b', 1)];
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    (window as unknown as { __e2ePads: typeof pads }).__e2ePads = pads;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: Gamepad[] }).__e2ePads;
    for (const pad of pads) {
      window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
    }
  });
  await expect(page.locator('[data-seat="1"]')).toContainText(/Blue/i);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { buttons: { pressed: boolean }[] }[] }).__e2ePads;
    for (const pad of pads) pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="1"]')).toContainText(/Blue/i);
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => window.__floppy?.phase === 2, null, { timeout: 15_000 });
  await expect.poll(async () => page.evaluate(() => window.__floppy?.playerColors?.[1])).toBe(1);
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: Gamepad[] }).__e2ePads;
    window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: pads[1] }));
  });
  await expect(page.getByRole('heading', { name: 'Controller disconnected' })).toBeVisible();
  await page.evaluate(() => {
    const pads = (window as unknown as { __e2ePads: { id: string; index: number }[] }).__e2ePads;
    pads[1]!.id = 'e2e-claim-new';
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pads[1] }));
  });
  await expect(page.getByRole('heading', { name: 'Controller disconnected' })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => window.__floppy?.playerColors?.[1])).toBe(1);
});

test('editor Rotate writes angle into the draft JSON', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  const before = await page.locator('#edjson').innerText();
  expect(before).not.toMatch(/"angle":/);
  await page.getByRole('button', { name: 'Rotate' }).click();
  await expect(page.locator('#edjson')).toContainText('"angle":');
  await page.getByRole('button', { name: 'Resize +' }).click();
  const after = await page.locator('#edjson').innerText();
  expect(after).toContain('"angle":');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#edjson')).not.toContainText('"angle":');
});

test('local play: an already-connected pad claims a seat without a new connect event', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-local-already',
      index: 0,
      connected: true,
      mapping: 'standard' as const,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Local Play' }).click();
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await expect(page.locator('[data-seat="0"]')).toContainText(/e2e-local-already/);
  await expect(page.locator('[data-seat="0"]')).toContainText(/joined/i);
  await expect(page.locator('[data-seat="0"]')).not.toHaveAttribute('data-ready', '1');
  await expect(page.locator('[data-seat="1"]')).toContainText(/empty/i);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = true;
  });
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = false;
  });
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
});

test('solo vs bots: an already-connected pad claims the human seat without a new connect event', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-already-pad',
      index: 0,
      connected: true,
      mapping: 'standard' as const,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.locator('[data-seat="0"]')).toContainText(/e2e-already-pad/);
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('[data-seat="1"]')).toContainText(/empty/i);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await expect.poll(async () => page.evaluate(() => window.__floppy?.playerColors?.[0])).toBe(0);
  await expect.poll(async () => page.evaluate(() => (window.__floppy?.playerXs ?? []).length)).toBe(4);
});

test('solo vs bots: a pad claims the keyboard seat instead of becoming P2', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-solo-pad',
      index: 0,
      connected: true,
      mapping: 'standard' as const,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo vs Bots' }).click();
  await expect(page.locator('[data-seat="0"]')).toContainText(/e2e-solo-pad/);
  await expect(page.locator('[data-seat="1"]')).toContainText(/empty/i);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await expect(page.locator('[data-seat="0"]')).toContainText(/e2e-solo-pad/);
  await expect(page.locator('[data-seat="1"]')).toContainText(/empty/i);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('canvas#game')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__floppy?.playerColors?.[0])).toBe(0);
});

test('remapped pause Start begins the join match (PLAN 4.12)', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-remap-start',
      index: 0,
      connected: true,
      mapping: 'standard' as const,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#padid').fill('e2e-remap-start');
  await page.locator('#map-pause').fill('8');
  await page.getByRole('button', { name: 'Save remap' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Local Play' }).click();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: Gamepad }).__e2ePad;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
  });
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = true;
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[0]!.pressed = false;
  });
  await expect(page.locator('[data-seat="0"]')).toHaveAttribute('data-ready', '1');
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[9]!.pressed = true;
  });
  await page.waitForTimeout(200);
  await expect(page.getByRole('heading', { name: 'Join' })).toBeVisible();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[9]!.pressed = false;
    pad.buttons[8]!.pressed = true;
  });
  await expect(page.locator('canvas#game')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0);
});

test('editor remapped Start playtests the draft', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'e2e-editor-start',
      index: 0,
      connected: true,
      mapping: 'standard' as const,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 1,
      hapticActuators: [],
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#padid').fill('e2e-editor-start');
  await page.locator('#map-pause').fill('8');
  await page.getByRole('button', { name: 'Save remap' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Level Editor' }).click();
  await expect(page.locator('text=Level Editor')).toBeVisible();
  await page.evaluate(() => {
    const pad = (window as unknown as { __e2ePad: { buttons: { pressed: boolean }[] } }).__e2ePad;
    pad.buttons[8]!.pressed = true;
  });
  await expect(page.locator('[data-countdown]')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0);
});

test('online lobby has room code and chat', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Online' }).click();
  await expect(page.getByRole('heading', { name: 'Online lobby' })).toBeVisible();
  await expect(page.locator('#hp')).toHaveValue('100');
  const lobbyHp = await page.locator('#hp option').allTextContents();
  expect(lobbyHp.map((s) => s.trim())).toEqual(expect.arrayContaining(['1', '25', '50', '100', '200']));
  await page.locator('#room').fill('TEST01');
  await page.locator('#chat').fill('hello couch');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('text=hello couch')).toBeVisible();
  await page.getByRole('button', { name: 'Host' }).click();
  await expect(page.locator('#room')).toHaveValue(/TEST01/i);
});
