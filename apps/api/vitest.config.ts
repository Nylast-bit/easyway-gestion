import { defineConfig } from 'vitest/config';
// Las pruebas *.int.test.ts necesitan Docker y se ejecutan con `npm run test:int` desde la raíz.
export default defineConfig({ test: { include: ['src/**/*.test.ts'], exclude: ['src/**/*.int.test.ts'] } });
