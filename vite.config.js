import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // MapLibre loads its own web worker as a sibling of itself:
  //   new URL('./maplibre-gl-worker.mjs', import.meta.url)
  // Pre-bundling rewrites the library into node_modules/.vite/deps/, which moves
  // import.meta.url there without copying the worker across, so the dev server
  // 404s on a file it says it is looking for in its own cache. The package already
  // ships a single self-contained ESM build, so there is nothing to gain by
  // optimizing it — served as-is, the sibling resolves.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
