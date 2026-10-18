import type { NextConfig } from 'next';
import { loadEnvFile } from 'node:process';

// Next carga apps/web/.env; las herramientas del proyecto usan también el .env raíz.
try { loadEnvFile('../../.env'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

// URL privada de la API Hono. El navegador solo habla con /api del mismo origen,
// así la cookie de sesión es httpOnly, SameSite y sin CORS.
const API_URL = (process.env.API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@easyway/shared'],
  async rewrites() {
    return [{ source: '/api/:ruta*', destination: `${API_URL}/api/:ruta*` }];
  },
};
export default config;
