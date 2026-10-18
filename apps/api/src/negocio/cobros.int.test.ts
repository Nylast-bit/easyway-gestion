import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { iniciarPostgresEfimero } from '../../../../scripts/db/postgres-efimero';
import { crearApp } from '../app';
import { crearAlmacenLocal } from '../almacen/local';
import { crearBaseDatos } from '../db/cliente';
import { cargos, gps, simcards, usuarios } from '../db/esquema';
import { hashearContrasena } from '../auth/criptografia';

let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let conexion: ReturnType<typeof crearBaseDatos>;
let app: ReturnType<typeof crearApp>;
const sesiones: Record<string, string> = {};
const CLAVE = 'clave-segura-123';
// Reloj fijo: 2026-10-18 en Santo Domingo.
const reloj = () => new Date('2026-10-18T15:00:00Z');

async function api(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; quien?: string } = {}) {
  const respuesta = await app.request(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
    headers: { ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: sesiones[opciones.quien ?? 'admin'] },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, datos: texto ? JSON.parse(texto) : null };
}
async function crear(ruta: string, cuerpo: unknown) {
  const r = await api(ruta, { cuerpo });
  if (r.estado !== 201) throw new Error(`${ruta}: ${r.estado} ${JSON.stringify(r.datos)}`);
  return r.datos;
}
async function iniciar(usuario: string, rol: 'admin' | 'tecnico') {
  await conexion.bd.insert(usuarios).values({ nombre: usuario, usuario, rol, contrasena_hash: await hashearContrasena(CLAVE) });
  const r = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: usuario, contrasena: CLAVE }) });
  sesiones[usuario] = r.headers.get('set-cookie')!.split(';')[0];
}

let planAnual: number;
let cliente: { id: number };
let vehiculo: { id: number };

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 8 });
  app = crearApp({
    bd: conexion.bd, enviador: { enviar: async () => {} }, produccion: false, reloj,
    almacen: crearAlmacenLocal({ directorio: mkdtempSync(join(tmpdir(), 'easyway-cobros-')) }),
  });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo, auditoria, pago_aplicaciones, pagos, cargos, servicios,
    instalaciones, gps_asignaciones, simcard_asignaciones, vehiculo_imagenes, vehiculos, gps, simcards, clientes, tecnicos RESTART IDENTITY CASCADE`;
  await base!.cliente`DELETE FROM planes WHERE nombre <> 'Plan Anual'`;
  await iniciar('admin', 'admin');
  await iniciar('tecnico', 'tecnico');
  planAnual = (await api('/planes')).datos.find((p: { nombre: string }) => p.nombre === 'Plan Anual').id;
  cliente = await crear('/clientes', { nombre: 'Transporte Caribe', tipo: 'Empresa', documento: '1-32-12345-6' });
  vehiculo = await crear('/vehiculos', { cliente_id: cliente.id, marca: 'isuzu', placa: 'L123', tipo: 'Camión' });
});

test('catálogos: plan anual sembrado, planes con nombre único y auditoría; técnicos solo leen tipos de servicio', async () => {
  expect((await api('/planes')).datos).toEqual([expect.objectContaining({ nombre: 'Plan Anual', periodicidad: 'Anual', precio: 5500, activo: true })]);
  const mensual = await crear('/planes', { nombre: 'Plan Mensual', periodicidad: 'Mensual', precio: '600.50' });
  expect(mensual).toMatchObject({ precio: 600.5, servicios_activos: 0 });
  expect((await api('/planes', { cuerpo: { nombre: 'plan mensual', periodicidad: 'Mensual', precio: 1 } })).datos.error).toBe('Ya existe un plan con ese nombre');
  expect((await api('/planes', { cuerpo: { nombre: 'X', periodicidad: 'Mensual', precio: 1.234 } })).estado).toBe(400);
  await api(`/planes/${mensual.id}`, { metodo: 'PUT', cuerpo: { nombre: 'Plan Mensual', periodicidad: 'Mensual', precio: 650, activo: false } });
  const auditoria = (await api(`/auditoria?entidad=plan&entidad_id=${mensual.id}`)).datos;
  expect(auditoria.map((a: { accion: string }) => a.accion)).toEqual(['actualizar', 'crear']);
  expect(auditoria[0]).toMatchObject({ usuario_nombre: 'admin', detalle: { antes: { precio: 600.5 }, despues: { precio: 650, activo: false } } });

  expect((await api('/tipos-servicio', { quien: 'tecnico' })).datos).toHaveLength(9);
  expect((await api('/tipos-servicio', { quien: 'tecnico', cuerpo: { nombre: 'Nuevo' } })).estado).toBe(403);
  for (const ruta of ['/planes', '/servicios', '/cargos', '/pagos', '/cobros/resumen', '/vencimientos', '/auditoria']) {
    expect((await api(ruta, { quien: 'tecnico' })).estado).toBe(403);
  }
  expect((await api(`/clientes`)).datos[0]).toMatchObject({ tipo: 'Empresa', documento: '1-32-12345-6' });
  expect((await api(`/vehiculos/${vehiculo.id}`)).datos).toMatchObject({ tipo: 'Camión' });
});

test('servicio anual: un plan activo por vehículo y generación de cargos idempotente incluso en paralelo', async () => {
  const servicio = await crear('/servicios', { vehiculo_id: vehiculo.id, plan_id: planAnual, fecha_inicio: '2025-11-01' });
  expect(servicio).toMatchObject({ precio: 5500, proximo_cobro: '2025-11-01', plan_nombre: 'Plan Anual' });
  expect((await api('/servicios', { cuerpo: { vehiculo_id: vehiculo.id, plan_id: planAnual, fecha_inicio: '2026-01-01' } })).datos.error)
    .toContain('ya tiene un plan activo');

  const [a, b] = await Promise.all([
    api('/cargos/generar', { cuerpo: { hasta: '2026-12-31' } }),
    api('/cargos/generar', { cuerpo: { hasta: '2026-12-31' } }),
  ]);
  expect(a.datos.creados + b.datos.creados).toBe(2);
  expect((await api('/cargos/generar', { cuerpo: { hasta: '2026-12-31' } })).datos.creados).toBe(0);
  const lista = (await api(`/cargos?cliente_id=${cliente.id}`)).datos;
  expect(lista.map((c: { periodo_inicio: string; periodo_fin: string }) => [c.periodo_inicio, c.periodo_fin]))
    .toEqual([['2025-11-01', '2026-10-31'], ['2026-11-01', '2027-10-31']]);
  expect(lista[0]).toMatchObject({ concepto: 'Plan Anual · L123', monto: 5500, estado: 'Pendiente', vencido: true });
  expect(lista[1]).toMatchObject({ vencido: false });
  expect((await api('/servicios')).datos[0].proximo_cobro).toBe('2027-11-01');
});

test('pagos: aplicación automática al más antiguo, parcial, saldo a favor y validación de aplicaciones manuales', async () => {
  await crear('/servicios', { vehiculo_id: vehiculo.id, plan_id: planAnual, fecha_inicio: '2025-11-01' });
  await api('/cargos/generar', { cuerpo: { hasta: '2026-12-31' } });
  const [viejo, nuevo] = (await api(`/cargos?cliente_id=${cliente.id}`)).datos;

  const pago = await crear('/pagos', { cliente_id: cliente.id, fecha: '2026-10-10', monto: 7000, metodo: 'Transferencia', referencia: 'FACT/2026/00300' });
  expect(pago.aplicaciones).toEqual([{ cargo_id: viejo.id, concepto: 'Plan Anual · L123', monto: 5500 }, { cargo_id: nuevo.id, concepto: 'Plan Anual · L123', monto: 1500 }]);
  expect(pago).toMatchObject({ aplicado: 7000, sin_aplicar: 0 });

  let cuenta = (await api(`/cobros/estado-cuenta/${cliente.id}`)).datos;
  expect(cuenta).toMatchObject({ total_cargado: 11000, total_pagado: 7000, saldo_pendiente: 4000, saldo_vencido: 0, saldo_a_favor: 0 });
  expect(cuenta.cargos.map((c: { estado: string }) => c.estado)).toEqual(['Pagado', 'Parcial']);

  const otro = await crear('/clientes', { nombre: 'Otro' });
  const ajeno = await crear('/cargos', { cliente_id: otro.id, concepto: 'Venta de equipo', monto: 2700, fecha_vencimiento: '2026-10-01' });
  const base = { cliente_id: cliente.id, fecha: '2026-10-18', metodo: 'Efectivo' };
  expect((await api('/pagos', { cuerpo: { ...base, monto: 5000, aplicaciones: [{ cargo_id: nuevo.id, monto: 4500 }] } })).estado).toBe(409);
  expect((await api('/pagos', { cuerpo: { ...base, monto: 5000, aplicaciones: [{ cargo_id: ajeno.id, monto: 100 }] } })).estado).toBe(400);
  expect((await api('/pagos', { cuerpo: { ...base, monto: 100, aplicaciones: [{ cargo_id: nuevo.id, monto: 200 }] } })).estado).toBe(400);
  expect((await api('/pagos', { cuerpo: { ...base, monto: 0 } })).estado).toBe(400);

  const sobrante = await crear('/pagos', { ...base, monto: 10000 });
  expect(sobrante).toMatchObject({ aplicado: 4000, sin_aplicar: 6000 });
  cuenta = (await api(`/cobros/estado-cuenta/${cliente.id}`)).datos;
  expect(cuenta).toMatchObject({ saldo_pendiente: 0, saldo_a_favor: 6000 });
});

test('anulaciones: un cargo con pagos no se anula; anular el pago restaura el saldo y queda auditado', async () => {
  const cargo = await crear('/cargos', { cliente_id: cliente.id, concepto: 'Reinstalación', monto: 1500, fecha_vencimiento: '2026-10-01', referencia_factura: 'B0100000099' });
  const pago = await crear('/pagos', { cliente_id: cliente.id, fecha: '2026-10-02', monto: 1500, metodo: 'Efectivo' });
  expect((await api(`/cargos/${cargo.id}/anular`, { cuerpo: { motivo: 'Error' } })).datos.error).toContain('anula primero esos pagos');
  expect((await api(`/pagos/${pago.id}/anular`, { cuerpo: { motivo: '' } })).estado).toBe(400);

  const anulado = await api(`/pagos/${pago.id}/anular`, { cuerpo: { motivo: 'Cheque devuelto' } });
  expect(anulado.datos).toMatchObject({ anulado: true, aplicado: 0, sin_aplicar: 0, motivo_anulacion: 'Cheque devuelto' });
  expect((await api(`/pagos/${pago.id}/anular`, { cuerpo: { motivo: 'Otra vez' } })).estado).toBe(409);
  expect((await api(`/cobros/estado-cuenta/${cliente.id}`)).datos).toMatchObject({ saldo_pendiente: 1500, saldo_vencido: 1500, total_pagado: 0 });

  const cargoAnulado = await api(`/cargos/${cargo.id}/anular`, { cuerpo: { motivo: 'Cortesía al cliente' } });
  expect(cargoAnulado.datos).toMatchObject({ estado: 'Anulado', saldo: 0, vencido: false });
  expect((await api(`/cobros/estado-cuenta/${cliente.id}`)).datos).toMatchObject({ total_cargado: 0, saldo_pendiente: 0 });
  const acciones = (await api('/auditoria')).datos.map((a: { entidad: string; accion: string }) => `${a.entidad}:${a.accion}`);
  expect(acciones.slice(0, 4)).toEqual(['cargo:anular', 'pago:anular', 'pago:crear', 'cargo:crear']);
});

test('concurrencia: pagos simultáneos nunca aplican más que el saldo de un cargo', async () => {
  const cargo = await crear('/cargos', { cliente_id: cliente.id, concepto: 'Plan Anual', monto: 5500, fecha_vencimiento: '2026-10-01' });
  const pagos = await Promise.all([1, 2, 3].map(() => api('/pagos', { cuerpo: { cliente_id: cliente.id, fecha: '2026-10-18', monto: 5500, metodo: 'Efectivo' } })));
  expect(pagos.map(p => p.estado)).toEqual([201, 201, 201]);
  expect(pagos.map(p => p.datos.aplicado).sort()).toEqual([0, 0, 5500]);
  const [{ total }] = await base!.cliente`SELECT sum(monto)::numeric AS total FROM pago_aplicaciones WHERE cargo_id = ${cargo.id}`;
  expect(Number(total)).toBe(5500);
  expect((await api(`/cobros/estado-cuenta/${cliente.id}`)).datos.saldo_a_favor).toBe(11000);
});

test('vencimientos: GPS a 1 año de la instalación, SIM a 1 año si no tenía fecha; edición manual auditada', async () => {
  const equipo = await crear('/gps', { imei: '863829070000001' });
  const sim = await crear('/simcards', { numero: '8095550001' });
  await api(`/gps/${equipo.id}`, { metodo: 'PUT', cuerpo: { imei: equipo.imei, simcard_id: sim.id } });
  await api(`/vehiculos/${vehiculo.id}`, { metodo: 'PUT', cuerpo: { cliente_id: cliente.id, marca: 'isuzu', placa: 'L123', tipo: 'Camión', gps_id: equipo.id } });
  const [filaGps] = await conexion.bd.select().from(gps).where(eq(gps.id, equipo.id));
  const [filaSim] = await conexion.bd.select().from(simcards).where(eq(simcards.id, sim.id));
  expect(filaGps.fecha_vencimiento).toBe('2027-10-18');
  expect(filaSim.fecha_vencimiento).toBe('2027-10-18');

  expect((await api('/vencimientos?dias=30')).datos).toEqual([]);
  const anual = (await api('/vencimientos?dias=366')).datos;
  expect(anual.map((v: { tipo: string; dias_restantes: number }) => [v.tipo, v.dias_restantes])).toEqual([['gps', 365], ['simcard', 365]]);
  expect(anual[0].vehiculo).toMatchObject({ descripcion: 'ISUZU (L123)', cliente_nombre: 'Transporte Caribe' });

  expect((await api(`/vencimientos/gps/${equipo.id}`, { metodo: 'PUT', cuerpo: { fecha_vencimiento: '2026-10-25' } })).estado).toBe(204);
  const proximos = (await api('/vencimientos?dias=30')).datos;
  expect(proximos).toEqual([expect.objectContaining({ tipo: 'gps', fecha: '2026-10-25', dias_restantes: 7 })]);
  expect((await api(`/auditoria?entidad=gps&entidad_id=${equipo.id}`)).datos[0].detalle).toEqual({ antes: '2027-10-18', despues: '2026-10-25' });
  expect((await api('/vencimientos/vehiculo/1', { metodo: 'PUT', cuerpo: { fecha_vencimiento: null } })).estado).toBe(404);
});

test('resumen de cobros: pendiente, vencido, deudores y servicios por facturar', async () => {
  await crear('/servicios', { vehiculo_id: vehiculo.id, plan_id: planAnual, fecha_inicio: '2025-11-01' });
  const resumenAntes = (await api('/cobros/resumen')).datos;
  expect(resumenAntes).toMatchObject({ pendiente: 0, por_generar: 1 });
  await api('/cargos/generar', { cuerpo: { hasta: '2026-10-18' } });
  await crear('/pagos', { cliente_id: cliente.id, fecha: '2026-10-05', monto: 1000, metodo: 'Tarjeta' });
  const resumen = (await api('/cobros/resumen')).datos;
  expect(resumen).toMatchObject({ pendiente: 4500, vencido: 4500, clientes_con_deuda: 1, cobrado_mes: 1000, por_generar: 0 });
  expect(resumen.deudores).toEqual([{ cliente_id: cliente.id, cliente_nombre: 'Transporte Caribe', saldo: 4500, vencido: 4500 }]);
  expect(await conexion.bd.select().from(cargos)).toHaveLength(1);
});
