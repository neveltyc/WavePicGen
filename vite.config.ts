/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Static SPA: base './' makes the build runnable from any path or file://,
// which keeps deployment trivial (drop the dist/ folder on any static host).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      reporter: ['text', 'html'],
    },
  },
});
