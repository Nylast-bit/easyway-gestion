import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/api/src/db/esquema.ts',
  out: './apps/api/drizzle',
});
