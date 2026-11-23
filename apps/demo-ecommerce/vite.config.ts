import { defineConfig } from 'vite';

/** Demo storefront only. The API remains a separate process with no DB access here. */
export default defineConfig({
  root: 'src/web',
  build: {
    outDir: '../../dist/web-bundle',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
