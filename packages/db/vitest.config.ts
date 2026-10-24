import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // PGlite boots Postgres in WASM and applies every migration once per file.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
