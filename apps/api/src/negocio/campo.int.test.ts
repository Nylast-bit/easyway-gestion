import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { iniciarPostgresEfimero } from '../../../../scripts/db/postgres-efimero';
import { crearApp } from '../app';
import { crearAlmacenLocal } from '../almacen/local';
import { crearBaseDatos } from '../db/cliente';
import { usuarios } from '../db/esquema';
import { hashearContrasena } from '../auth/criptografia';

let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let conexion: ReturnType<typeof crearBaseDatos>;
let app: ReturnType<typeof crearApp>;
const sesiones: Record<string, string> = {};
const CLAVE = 'clave-segura-123';
const reloj = () => new Date('2026-10-18T15:00:00Z');
const INSTALACION = 1, MANTENIMIENTO = 3, DESINSTALACION = 9;

async function api(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; quien?: string } = {}) {
  const r = await app.request(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
    headers: { ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: sesiones[opciones.quien ?? 'admin'] },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const texto = await r.text();
  return { estado: r.status, datos: texto ? JSON.parse(texto) : null };
}
const contar = async (tabla: string) => Number((await base!.cliente.unsafe(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n);
async function iniciar(usuario: string, rol: 'admin' | 'tecnico', tecnico_id: number | null = null) {
  await conexion.bd.insert(usuarios).values({ nombre: usuario, usuario, rol, tecnico_id, contrasena_hash: await hashearContrasena(CLAVE) });
  const r = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: usuario, contrasena: CLAVE }) });
  sesiones[usuario] = r.headers.get('set-cookie')!.split(';')[0];
}
const trabajo = (extra: Record<string, unknown>) => ({ tipo_servicio_id: INSTALACION, fecha_instalacion: '2026-10-17T10:00:00-04:00', ...extra });

let tecA: number;
let tecB: number;

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 6 });
  app = crearApp({ bd: conexion.bd, enviador: { enviar: async () => {} }, produccion: false, reloj,
    almacen: crearAlmacenLocal({ directorio: mkdtempSync(join(tmpdir(), 'easyway-campo-')) }) });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo, auditoria, pago_aplicaciones, pagos, cargos, servicios,
    instalaciones, gps_asignaciones, simcard_asignaciones, vehiculo_imagenes, vehiculos, gps, simcards, clientes, tecnicos RESTART IDENTITY CASCADE`;
  await iniciar('admin', 'admin');
  tecA = (await api('/tecnicos', { cuerpo: { nombre: 'Técnico A' } })).datos.id;
  tecB = (await api('/tecnicos', { cuerpo: { nombre: 'Técnico B' } })).datos.id;
  await iniciar('tec.a', 'tecnico', tecA);
  await iniciar('tec.b', 'tecnico', tecB);
  await iniciar('sin.ficha', 'tecnico');
});

test('flujo completo: registro en campo, aprobación con unión de duplicados, inventario, plan y costos pagados', async () => {
  const existente = (await api('/clientes', { cuerpo: { nombre: 'FLOTA DEL ESTE', tipo: 'Empresa' } })).datos;
  const planAnual = (await api('/planes')).datos[0].id;

  const registro = await api('/campo/trabajos', { quien: 'tec.a', cuerpo: trabajo({
    cliente_nuevo: { nombre: 'Flota del Este SRL', telefono: '809-555-0101' },
    vehiculo_nuevo: { marca: 'toyota', modelo: 'hilux', placa: 'l-123456', tipo: 'Carro' },
    imei: '863829070000001', sim: '809-555-1001', notas: 'Equipo bajo el tablero',
  }) });
  expect(registro.estado).toBe(201);
  expect(registro.datos).toMatchObject({ aprobacion: 'Pendiente', cliente_nombre: 'Flota del Este SRL · nuevo', vehiculo_descripcion: 'TOYOTA HILUX (L123456) · nuevo', imei: '863829070000001' });
  // Nada toca inventario hasta aprobar.
  expect([await contar('gps'), await contar('simcards'), await contar('vehiculos')]).toEqual([0, 0, 0]);
  expect((await api('/instalaciones', { quien: 'tec.a' })).datos).toEqual([]);

  const cola = (await api('/aprobaciones')).datos;
  expect(cola).toHaveLength(1);
  expect(cola[0].coincidencias.clientes).toEqual([{ id: existente.id, nombre: 'FLOTA DEL ESTE' }]);
  expect(cola[0].coincidencias.gps).toBeNull();

  const aprobado = await api(`/aprobaciones/${registro.datos.id}/aprobar`, { cuerpo: { costo_tecnico: 1200, cliente_id: existente.id, plan_id: planAnual } });
  expect(aprobado.estado).toBe(200);
  expect(aprobado.datos).toMatchObject({ aprobacion: 'Aprobada', cliente_nombre: 'FLOTA DEL ESTE', costo_tecnico: 1200 });
  expect(await contar('clientes')).toBe(1);
  const [equipo] = await base!.cliente`SELECT g.estado, g.fecha_vencimiento::text AS vence, s.estado AS sim FROM gps g
    JOIN simcard_asignaciones sa ON sa.gps_id = g.id AND sa.fecha_fin IS NULL JOIN simcards s ON s.id = sa.simcard_id`;
  expect(equipo).toEqual({ estado: 'Instalado', vence: '2027-10-18', sim: 'Asignada' });
  expect((await api('/servicios')).datos).toEqual([expect.objectContaining({ fecha_inicio: '2026-10-17', proximo_cobro: '2026-10-17', precio: 5500 })]);
  expect((await api(`/aprobaciones/${registro.datos.id}/aprobar`, { cuerpo: { costo_tecnico: 1 } })).estado).toBe(409);

  // Mantenimiento del mismo equipo y vehículo existentes: no cambia asignaciones.
  const vehiculo = aprobado.datos.vehiculo_id;
  const mantenimiento = await api('/campo/trabajos', { quien: 'tec.a', cuerpo: trabajo({ cliente_id: existente.id, vehiculo_id: vehiculo, imei: '863829070000001', tipo_servicio_id: MANTENIMIENTO }) });
  await api(`/aprobaciones/${mantenimiento.datos.id}/aprobar`, { cuerpo: { costo_tecnico: 500 } });
  expect(await contar('gps_asignaciones')).toBe(1);

  // Desinstalación por otro técnico: cierra la asignación y el GPS vuelve a inventario.
  const retiro = await api('/campo/trabajos', { quien: 'tec.b', cuerpo: trabajo({ cliente_id: existente.id, vehiculo_id: vehiculo, imei: '863829070000001', tipo_servicio_id: DESINSTALACION }) });
  await api(`/aprobaciones/${retiro.datos.id}/aprobar`, { cuerpo: { costo_tecnico: 0 } });
  expect((await base!.cliente`SELECT estado FROM gps`)[0].estado).toBe('Disponible');
  expect(await contar('gps_asignaciones WHERE fecha_fin IS NULL')).toBe(0);

  // Costos: resumen por técnico, pago todo-o-nada y reversión auditada.
  const resumen = (await api('/costos-tecnicos/resumen')).datos;
  expect(resumen).toEqual([
    { tecnico_id: tecA, tecnico_nombre: 'Técnico A', trabajos: 2, total: 1700, pagado: 0, pendiente: 1700 },
    { tecnico_id: tecB, tecnico_nombre: 'Técnico B', trabajos: 1, total: 0, pagado: 0, pendiente: 0 },
  ]);
  const pendientesA = (await api(`/costos-tecnicos?estado=pendientes&tecnico_id=${tecA}`)).datos;
  expect(pendientesA.map((c: { costo: number }) => c.costo).sort()).toEqual([1200, 500]);
  const ids = pendientesA.map((c: { instalacion_id: number }) => c.instalacion_id);
  expect((await api('/costos-tecnicos/pagar', { cuerpo: { instalacion_ids: [...ids, retiro.datos.id, 9999] } })).estado).toBe(409);
  expect(await contar('instalaciones WHERE costo_pagado_at IS NOT NULL')).toBe(0);
  expect((await api('/costos-tecnicos/pagar', { cuerpo: { instalacion_ids: ids, referencia: 'Transferencia 0042' } })).datos).toEqual({ marcados: 2, total: 1700 });
  expect((await api('/campo/costos', { quien: 'tec.a' })).datos).toMatchObject({ total: 1700, pagado: 1700, pendiente: 0 });
  expect((await api(`/costos-tecnicos/${ids[0]}`, { metodo: 'PUT', cuerpo: { costo_tecnico: 1300 } })).estado).toBe(409);
  expect((await api(`/costos-tecnicos/${ids[0]}/desmarcar`, { cuerpo: { motivo: 'Transferencia rechazada' } })).estado).toBe(204);
  const auditoria = (await api(`/auditoria?entidad=instalacion&entidad_id=${ids[0]}`)).datos;
  expect(auditoria[0]).toMatchObject({ accion: 'desmarcar_pago', detalle: { motivo: 'Transferencia rechazada', referencia: 'Transferencia 0042' } });
});

test('aislamiento y validación: cada técnico ve lo suyo; solo admins aprueban; rechazo con motivo', async () => {
  const cliente = (await api('/clientes', { cuerpo: { nombre: 'Cliente Uno' } })).datos;
  const otro = (await api('/clientes', { cuerpo: { nombre: 'Cliente Dos' } })).datos;
  const vehiculoOtro = (await api('/vehiculos', { cuerpo: { cliente_id: otro.id, placa: 'A000002' } })).datos;
  expect((await api('/campo/clientes?q=clien', { quien: 'tec.a' })).datos.map((c: { nombre: string }) => c.nombre)).toEqual(['Cliente Dos', 'Cliente Uno']);
  expect((await api(`/campo/vehiculos?cliente_id=${otro.id}`, { quien: 'tec.a' })).datos).toEqual([{ id: vehiculoOtro.id, descripcion: 'Vehículo (A000002)', placa: 'A000002', tipo: 'Carro' }]);

  expect((await api('/campo/trabajos', { quien: 'sin.ficha', cuerpo: trabajo({}) })).estado).toBe(403);
  expect((await api('/campo/trabajos', { quien: 'admin' })).estado).toBe(403);
  const invalidos = [
    trabajo({ cliente_id: cliente.id, cliente_nuevo: { nombre: 'X' }, vehiculo_nuevo: { placa: 'A1' }, imei: '863829070000002' }),
    trabajo({ cliente_id: cliente.id, vehiculo_id: vehiculoOtro.id, imei: '863829070000002' }),
    trabajo({ cliente_id: cliente.id, vehiculo_nuevo: { color: 'rojo' }, imei: '863829070000002' }),
    trabajo({ cliente_id: cliente.id, vehiculo_nuevo: { placa: 'A1' }, imei: '123' }),
  ];
  for (const cuerpo of invalidos) expect((await api('/campo/trabajos', { quien: 'tec.a', cuerpo })).estado).toBe(400);

  const propio = await api('/campo/trabajos', { quien: 'tec.a', cuerpo: trabajo({ cliente_id: cliente.id, vehiculo_nuevo: { placa: 'B000001' }, imei: '863829070000002' }) });
  expect((await api('/campo/trabajos', { quien: 'tec.b' })).datos).toEqual([]);
  expect((await api('/aprobaciones', { quien: 'tec.a' })).estado).toBe(403);
  expect((await api(`/aprobaciones/${propio.datos.id}/rechazar`, { cuerpo: { motivo: '' } })).estado).toBe(400);
  await api(`/aprobaciones/${propio.datos.id}/rechazar`, { cuerpo: { motivo: 'El IMEI no coincide con la foto' } });
  expect((await api('/campo/trabajos', { quien: 'tec.a' })).datos[0]).toMatchObject({ aprobacion: 'Rechazada', motivo_rechazo: 'El IMEI no coincide con la foto' });
  expect((await api(`/aprobaciones/${propio.datos.id}/aprobar`, { cuerpo: { costo_tecnico: 1 } })).estado).toBe(409);
});

test('rollback: si el GPS ya está instalado en otro vehículo, la aprobación no crea nada', async () => {
  const cliente = (await api('/clientes', { cuerpo: { nombre: 'Dueño Actual' } })).datos;
  const equipo = (await api('/gps', { cuerpo: { imei: '863829070000003' } })).datos;
  await api('/vehiculos', { cuerpo: { cliente_id: cliente.id, placa: 'C000001', gps_id: equipo.id } });
  const conflicto = await api('/campo/trabajos', { quien: 'tec.a', cuerpo: trabajo({
    cliente_nuevo: { nombre: 'Cliente Nuevo Conflicto' }, vehiculo_nuevo: { placa: 'C000002' }, imei: '863829070000003', sim: '8095559999',
  }) });
  const pendiente = (await api('/aprobaciones')).datos[0];
  expect(pendiente.coincidencias.gps).toMatchObject({ estado: 'Instalado', vehiculo: 'Vehículo (C000001)' });

  const fallo = await api(`/aprobaciones/${conflicto.datos.id}/aprobar`, { cuerpo: { costo_tecnico: 800 } });
  expect(fallo.estado).toBe(409);
  expect(fallo.datos.error).toContain('no está disponible');
  expect([await contar('clientes'), await contar('vehiculos'), await contar('simcards')]).toEqual([1, 1, 0]);
  expect((await api('/aprobaciones')).datos[0].aprobacion).toBe('Pendiente');
});
