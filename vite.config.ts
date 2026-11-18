import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served from https://magicalbearclaw.github.io/null-signal/
  base: '/null-signal/',
  build: {
    target: 'es2023',
    sourcemap: true,
    // three.js alone is ~500 kB minified; revisit with per-level code splitting in the perf pass (MIC-129).
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
