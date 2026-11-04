import { defineConfig } from 'vite';

// Le jeu est autonome : tout est servi depuis public/ (aucune ressource externe, règle Stake).
export default defineConfig({
  base: './',
  server: { host: true, port: 5210, fs: { allow: ['../..'] } },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
