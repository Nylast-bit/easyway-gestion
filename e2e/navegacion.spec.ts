import { expect, test } from '@playwright/test';
import { iniciarSesionSimulada, prepararAislamiento } from './sesion';

test('navega las siete rutas con datos de la API y recarga sin consultar producción', async ({ page, context }) => {
  const errores: string[] = [];
  page.on('pageerror', error => errores.push(error.message));
  await prepararAislamiento(page);
  await iniciarSesionSimulada(context, page);
  await page.goto('/');
  await expect(page.getByText('Ana Admin')).toBeVisible();
  await expect(page.locator('.stat-card').filter({ hasText: 'Simcards en Inventario' })).toContainText('4');
  for (const [ruta, titulo] of [
    ['/', 'Dashboard'], ['/clients', 'Clientes'], ['/technicians', 'Técnicos'],
    ['/vehicles', 'Vehículos'], ['/gps', 'GPS'], ['/simcards', 'Simcards'], ['/installations', 'Instalaciones'],
  ]) {
    await page.getByRole('link', { name: titulo, exact: true }).click();
    await expect(page).toHaveURL(ruta);
    await expect(page.getByRole('heading', { name: titulo, exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Instalaciones', exact: true })).toBeVisible();
  expect(errores).toEqual([]);
});
