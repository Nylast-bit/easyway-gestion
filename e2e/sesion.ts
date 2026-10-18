import type { BrowserContext, Page } from '@playwright/test';

export const usuarioPrueba = { id: 1, nombre: 'Ana Admin', usuario: 'admin', correo: null, rol: 'admin', tecnico_id: null };

// La API Hono no se arranca en e2e: se simula en el navegador. Supabase ya no
// debe recibir peticiones desde la web; se bloquea para detectar regresiones.
export async function prepararAislamiento(page: Page) {
  await page.route(/supabase\.(co|com)/, route => route.abort());
}

export async function iniciarSesionSimulada(context: BrowserContext, page: Page) {
  await context.addCookies([{ name: 'easyway_sesion', value: 'token-e2e', url: 'http://127.0.0.1:3100', httpOnly: true, sameSite: 'Lax' }]);
  // Playwright usa la última ruta registrada que coincide: primero la genérica, luego las específicas.
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/campo/costos', route => route.fulfill({ json: { tecnico_id: 2, tecnico_nombre: 'Pedro', trabajos: 0, total: 0, pagado: 0, pendiente: 0 } }));
  await page.route('**/api/resumen', route => route.fulfill({ json: { clientes: 2, vehiculos: 1, gps: 3, simcards: 4 } }));
  await page.route('**/api/auth/sesion', route => route.fulfill({ json: { usuario: usuarioPrueba } }));
}
