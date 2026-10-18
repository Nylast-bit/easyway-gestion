import type { BrowserContext, Page } from '@playwright/test';

export const usuarioPrueba = { id: 1, nombre: 'Ana Admin', usuario: 'admin', correo: null, rol: 'admin', tecnico_id: null };

// La API Hono no se arranca en e2e: se simula en el navegador y se bloquea Supabase.
export async function prepararAislamiento(page: Page) {
  await page.route(/supabase\.(co|com)/, route => route.abort());
}

export async function iniciarSesionSimulada(context: BrowserContext, page: Page) {
  await context.addCookies([{ name: 'easyway_sesion', value: 'token-e2e', url: 'http://127.0.0.1:3100', httpOnly: true, sameSite: 'Lax' }]);
  await page.route('**/api/auth/sesion', route => route.fulfill({ json: { usuario: usuarioPrueba } }));
}
