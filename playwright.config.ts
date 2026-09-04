import { defineConfig, devices } from '@playwright/test';

const swiftShaderArgs = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-angle=vulkan',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
  '--disable-vulkan-surface',
];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // The room relay, run locally by wrangler; the preview server proxies /ws to it.
      command: 'npm run dev:worker -- --ip 127.0.0.1 --port 8787',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
  ],
  projects: [
    {
      name: 'logic',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-gl=swiftshader'],
        },
      },
      testMatch: /logic\.spec\.ts/,
    },
    {
      name: 'online',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-gl=swiftshader'],
        },
      },
      testMatch: /online\.spec\.ts/,
    },
    {
      name: 'gpu',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: swiftShaderArgs,
        },
      },
      testMatch: /gpu\.spec\.ts/,
    },
  ],
});
