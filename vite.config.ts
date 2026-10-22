import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages (/Dargos-Ju/) and inside the Android app.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
  // jieba-wasm locates its .wasm file relative to its own module, which pre-bundling breaks.
  optimizeDeps: { exclude: ['jieba-wasm'] },
});
