import { expect, test, type Route } from '@playwright/test';
import { prepararAislamiento, usuarioPrueba } from './sesion';

// Flujo completo en el navegador con una API simulada con estado:
// el técnico registra un trabajo → el admin lo aprueba con costo → lo marca pagado → el técnico lo ve cobrado.
test('técnico → aprobación → costo pagado', async ({ page, context }) => {
  const errores: string[] = [];
  page.on('pageerror', error => errores.push(error.message));
  page.on('dialog', dialogo => dialogo.accept('TRF-0042'));
  await prepararAislamiento(page);
  await context.addCookies([{ name: 'easyway_sesion', value: 'token-e2e', url: 'http://127.0.0.1:3100', httpOnly: true, sameSite: 'Lax' }]);

  const tecnico = { ...usuarioPrueba, id: 5, nombre: 'Pedro Técnico', usuario: 'pedro', rol: 'tecnico', tecnico_id: 2 };
  let usuario: typeof usuarioPrueba | typeof tecnico = tecnico;
  const trabajos: Record<string, unknown>[] = [];
  const responder = (route: Route, json: unknown, status = 200) => route.fulfill({ status, json });
  const resumen = () => {
    const aprobados = trabajos.filter(t => t.aprobacion === 'Aprobada');
    const total = aprobados.reduce((s, t) => s + (t.costo_tecnico as number), 0);
    const pagado = aprobados.filter(t => t.costo_pagado_at).reduce((s, t) => s + (t.costo_tecnico as number), 0);
    return { tecnico_id: 2, tecnico_nombre: 'Pedro Técnico', trabajos: aprobados.length, total, pagado, pendiente: total - pagado };
  };

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const ruta = url.pathname + url.search;
    const metodo = route.request().method();
    if (ruta === '/api/auth/sesion') return responder(route, { usuario });
    if (ruta.startsWith('/api/tipos-servicio')) return responder(route, [{ id: 1, nombre: 'Instalación', activo: true }]);
    if (ruta === '/api/planes') return responder(route, [{ id: 1, nombre: 'Plan Anual', periodicidad: 'Anual', precio: 5500, activo: true, servicios_activos: 0 }]);
    if (ruta === '/api/campo/costos') return responder(route, resumen());
    if (ruta === '/api/campo/trabajos' && metodo === 'POST') {
      const cuerpo = route.request().postDataJSON();
      const trabajo = {
        id: 21, aprobacion: 'Pendiente', estado: 'Completado', tipo: 'Instalación', fecha_instalacion: cuerpo.fecha_instalacion, created_at: '',
        motivo_rechazo: null, notas: null, cliente_nombre: `${cuerpo.cliente_nuevo.nombre} · nuevo`, vehiculo_descripcion: `Vehículo (${cuerpo.vehiculo_nuevo.placa}) · nuevo`,
        imei: cuerpo.imei, sim: null, vehiculo_id: null, costo_tecnico: null, costo_pagado_at: null, tecnico_nombre: 'Pedro Técnico', registrada_por_nombre: 'pedro',
        propuesta: { cliente_id: null, cliente_nuevo: cuerpo.cliente_nuevo, vehiculo_nuevo: cuerpo.vehiculo_nuevo, imei: cuerpo.imei, sim: null },
        coincidencias: { clientes: [], vehiculos: [], gps: null, simcard: null },
      };
      trabajos.push(trabajo);
      return responder(route, trabajo, 201);
    }
    if (ruta === '/api/campo/trabajos') return responder(route, trabajos);
    if (ruta === '/api/aprobaciones') return responder(route, trabajos.filter(t => t.aprobacion === 'Pendiente'));
    if (ruta === '/api/aprobaciones/21/aprobar') {
      const { costo_tecnico } = route.request().postDataJSON();
      Object.assign(trabajos[0], { aprobacion: 'Aprobada', costo_tecnico: Number(costo_tecnico), vehiculo_id: 7, cliente_nombre: 'Flota del Este SRL' });
      return responder(route, trabajos[0]);
    }
    if (ruta === '/api/costos-tecnicos/resumen') return responder(route, [resumen()]);
    if (ruta.startsWith('/api/costos-tecnicos?estado=pendientes')) {
      return responder(route, trabajos.filter(t => t.aprobacion === 'Aprobada' && !t.costo_pagado_at).map(t => ({
        instalacion_id: t.id, tecnico_id: 2, tecnico_nombre: 'Pedro Técnico', fecha_instalacion: t.fecha_instalacion, tipo: 'Instalación',
        cliente_nombre: t.cliente_nombre, vehiculo_descripcion: 'Vehículo (L123456)', costo: t.costo_tecnico, pagado_at: null, referencia: null,
      })));
    }
    if (ruta === '/api/costos-tecnicos/pagar') {
      const { instalacion_ids, referencia } = route.request().postDataJSON();
      expect(referencia).toBe('TRF-0042');
      for (const t of trabajos) if (instalacion_ids.includes(t.id)) t.costo_pagado_at = '2026-10-18T15:00:00Z';
      return responder(route, { marcados: instalacion_ids.length, total: 1200 });
    }
    return responder(route, []);
  });

  // Técnico registra el trabajo desde el móvil.
  await page.goto('/field');
  await page.getByRole('button', { name: /Nuevo trabajo/ }).click();
  await page.getByRole('button', { name: 'Es un cliente nuevo' }).click();
  await page.getByLabel('Cliente *').fill('Flota del Este SRL');
  await page.getByLabel('Vehículo *').fill('L123456');
  await page.getByLabel('IMEI *').fill('863829070000001');
  await page.getByRole('button', { name: 'Enviar trabajo' }).click();
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible();

  // El administrador lo aprueba con costo.
  usuario = usuarioPrueba;
  await page.goto('/approvals');
  await page.getByRole('button', { name: /Flota del Este SRL/ }).click();
  await page.getByLabel('Costo del técnico (RD$) *').fill('1200');
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByText('No hay trabajos pendientes de aprobación.')).toBeVisible();

  // Y lo marca pagado.
  await page.goto('/technician-costs');
  await expect(page.getByText('Debe RD$1,200.00')).toBeVisible();
  await page.getByLabel('Elegir trabajo 21').check();
  await page.getByRole('button', { name: /Marcar pagado \(1\)/ }).click();
  await expect(page.getByText('No hay trabajos por pagar.')).toBeVisible();

  // El técnico ve el trabajo aprobado y cobrado.
  usuario = tecnico;
  await page.goto('/field');
  await expect(page.getByText('Aprobada', { exact: true })).toBeVisible();
  await expect(page.getByText('RD$1,200.00 · pagado')).toBeVisible();
  expect(errores).toEqual([]);
});
