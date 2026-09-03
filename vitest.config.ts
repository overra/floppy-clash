import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Whole-roster sweeps and 4-bot arena soaks step thousands of physics ticks; give them headroom on a busy box.
    testTimeout: 30_000,
  },
});
