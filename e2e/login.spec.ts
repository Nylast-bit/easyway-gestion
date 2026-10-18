import { expect, test } from '@playwright/test';
import { prepararAislamiento, usuarioPrueba } from './sesion';

test('sin sesión redirige al login conservando la ruta solicitada', async ({ page }) => {
  await prepararAislamiento(page);
  await page.goto('/clients');
  await expect(page).toHaveURL('/login?siguiente=%2Fclients');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('login con correo pide OTP, verifica y abre la ruta solicitada', async ({ page, context }) => {
  const errores: string[] = [];
  page.on('pageerror', error => errores.push(error.message));
  await prepararAislamiento(page);
  const usuario = { ...usuarioPrueba, usuario: null, correo: 'ana@ejemplo.do' };
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 202, json: { estado: 'verificacion_requerida', desafio: 'd'.repeat(43), correo: 'an•@ejemplo.do', reintentarEn: 60 },
  }));
  await page.route('**/api/auth/verificar-correo', async route => {
    const { codigo } = route.request().postDataJSON();
    if (codigo !== '123456') return route.fulfill({ status: 400, json: { error: 'Código incorrecto. Te quedan 4 intentos.' } });
    await context.addCookies([{ name: 'easyway_sesion', value: 'token-e2e', url: 'http://127.0.0.1:3100', httpOnly: true, sameSite: 'Lax' }]);
    return route.fulfill({ json: { estado: 'sesion_iniciada', usuario } });
  });
  await page.route('**/api/auth/sesion', route => route.fulfill({ json: { usuario } }));

  await page.goto('/login?siguiente=%2Fgps');
  await page.getByLabel('Usuario o correo').fill('ana@ejemplo.do');
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Verifica tu correo' })).toBeVisible();
  await expect(page.getByText('an•@ejemplo.do')).toBeVisible();

  await page.getByLabel('Dígito 1').pressSequentially('000000');
  await expect(page.getByRole('alert').filter({ hasText: 'Código incorrecto' })).toBeVisible();
  await page.getByLabel('Dígito 1').pressSequentially('123456');
  await expect(page).toHaveURL('/gps');
  await expect(page.getByRole('heading', { name: 'GPS', exact: true })).toBeVisible();
  await expect(page.getByText('Ana Admin')).toBeVisible();
  expect(errores).toEqual([]);
});
