import { expect, test } from '@playwright/test';
import { iniciarSesionSimulada, prepararAislamiento, usuarioPrueba } from './sesion';

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

test('un técnico entra a trabajo de campo y no accede a pantallas de administración', async ({ page, context }) => {
  await prepararAislamiento(page);
  await iniciarSesionSimulada(context, page);
  await page.route('**/api/auth/sesion', route => route.fulfill({ json: { usuario: { ...usuarioPrueba, nombre: 'Pedro Técnico', rol: 'tecnico', tecnico_id: 2 } } }));
  await page.goto('/clients');
  await expect(page).toHaveURL('/field');
  await expect(page.getByRole('heading', { name: 'Trabajo de campo' })).toBeVisible();
  await expect(page.getByRole('link')).toHaveCount(2);
  await page.getByRole('link', { name: 'Instalaciones' }).click();
  await expect(page.getByRole('heading', { name: 'Mis instalaciones' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Agregar/ })).toHaveCount(0);
});
