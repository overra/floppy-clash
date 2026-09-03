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
      command: 'PORT=8787 npx tsx server/signaling.ts',
      url: 'http://127.0.0.1:8787',
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
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
      testMatch: /logic\.spec\.ts|webrtc\.spec\.ts|walkthrough\.spec\.ts/,
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
