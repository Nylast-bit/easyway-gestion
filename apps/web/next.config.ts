import type { NextConfig } from 'next';
import { loadEnvFile } from 'node:process';

// Next carga apps/web/.env; las herramientas del proyecto usan también el .env raíz.
try { loadEnvFile('../../.env'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

const config: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
};
export default config;
