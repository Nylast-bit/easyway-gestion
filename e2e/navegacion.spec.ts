import { expect, test } from '@playwright/test';

test('navega las siete rutas y recarga sin consultar producción', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', error => errores.push(error.message));
  await page.route(/supabase\.(co|com)/, route => route.abort());
  await page.goto('/');
  for (const [ruta, titulo] of [
    ['/', 'Dashboard'], ['/clients', 'Clientes'], ['/technicians', 'Técnicos'],
    ['/vehicles', 'Vehículos'], ['/gps', 'GPS'], ['/simcards', 'Simcards'], ['/installations', 'Instalaciones'],
  ]) {
    await page.getByRole('link', { name: titulo, exact: true }).click();
    await expect(page).toHaveURL(ruta);
    await expect(page.getByRole('heading', { name: titulo, exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Conexión de datos pendiente');
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Instalaciones', exact: true })).toBeVisible();
  expect(errores).toEqual([]);
});
