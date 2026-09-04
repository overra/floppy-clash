import path from 'node:path';
import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // The room relay lives in the Worker (`npm run dev:worker`); in dev the page reaches it through
    // the same origin, as it does in production. `vite preview` inherits this proxy.
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true, changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
