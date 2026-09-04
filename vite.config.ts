import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

/**
 * In production the Worker's static assets serve `/stats` from `stats.html`; Vite's dev and preview
 * servers only know the file name, so give them the same clean URL.
 */
function statsRoute(): Plugin {
  const rewrite = (req: { url?: string }) => {
    if (req.url === '/stats' || req.url?.startsWith('/stats?')) req.url = `/stats.html${req.url.slice('/stats'.length)}`;
  };
  return {
    name: 'floppy-clash:stats-route',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
  };
}

export default defineConfig({
  // Tailwind only touches CSS that imports it (the /stats dashboard); the game's styles are untouched.
  plugins: [typegpu(), tailwindcss(), statsRoute()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // The room relay and the telemetry/stats API live in the Worker (`npm run dev:worker`); in dev the
    // page reaches them through the same origin, as it does in production. `vite preview` inherits this proxy.
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true, changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Two pages, two bundles: the game, and the /stats dashboard (React + charts) that only staff open.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        stats: path.resolve(__dirname, 'stats.html'),
      },
      onwarn(warning, warn) {
        // `motion` ships React Server Components directives that mean nothing to a Vite bundle. Rollup
        // then fails to map that directive's position through motion's own sourcemaps, so drop that echo too.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'SOURCEMAP_ERROR' && warning.id?.includes('framer-motion')) return;
        warn(warning);
      },
    },
  },
});
