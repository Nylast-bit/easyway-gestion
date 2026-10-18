import { defineConfig } from 'vitest/config';

// Integración con PostgreSQL efímero en Docker: herramientas de BD y flujos de la API.
export default defineConfig({
  test: {
    include: ['scripts/db/**/*.test.ts', 'apps/api/src/**/*.int.test.ts'],
    testTimeout: 30000, hookTimeout: 180000,
  },
});
