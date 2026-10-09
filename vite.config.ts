import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`      -> dist/ : static build to upload to the Stake Engine CDN (relative paths)
// `npm run build:demo` -> dist-demo/index.html : single self-contained file (offline demo)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'demo' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    assetsInlineLimit: mode === 'demo' ? 100_000_000 : 4096,
    target: 'es2020',
    sourcemap: false,
  },
}));
