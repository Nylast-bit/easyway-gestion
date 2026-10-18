import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import type { ImportacionFila, OpcionesImportacion } from '@easyway/shared';
import { iniciarPostgresEfimero } from '../../../../scripts/db/postgres-efimero';
import { crearApp } from '../app';
import { crearAlmacenLocal } from '../almacen/local';
import { crearBaseDatos } from '../db/cliente';
import { usuarios } from '../db/esquema';
import { hashearContrasena } from '../auth/criptografia';

const FIXTURE = readFileSync(fileURLToPath(new URL('../../../../tests/fixtures/excel-muestra.xlsx', import.meta.url)));
let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let conexion: ReturnType<typeof crearBaseDatos>;
let app: ReturnType<typeof crearApp>;
const sesiones: Record<string, string> = {};
const CLAVE = 'clave-segura-123';
const reloj = () => new Date('2026-10-18T15:00:00Z');

async function api(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; quien?: string } = {}) {
  const r = await app.request(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
    headers: { ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: sesiones[opciones.quien ?? 'admin'] },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const texto = await r.text();
  return { estado: r.status, datos: texto ? JSON.parse(texto) : null };
}
async function subir(contenido: Uint8Array = FIXTURE, nombre = 'Control de instalación.xlsx', quien = 'admin') {
  const formulario = new FormData();
  formulario.set('archivo', new File([contenido as Uint8Array<ArrayBuffer>], nombre));
  const r = await app.request('/api/importaciones', { method: 'POST', body: formulario, headers: { Cookie: sesiones[quien] } });
  return { estado: r.status, datos: await r.json() };
}
const contar = async (tabla: string) => Number((await base!.cliente.unsafe(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n);
async function iniciar(usuario: string, rol: 'admin' | 'tecnico') {
  await conexion.bd.insert(usuarios).values({ nombre: usuario, usuario, rol, contrasena_hash: await hashearContrasena(CLAVE) });
  const r = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: usuario, contrasena: CLAVE }) });
  sesiones[usuario] = r.headers.get('set-cookie')!.split(';')[0];
}

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 6 });
  app = crearApp({ bd: conexion.bd, enviador: { enviar: async () => {} }, produccion: false, reloj,
    almacen: crearAlmacenLocal({ directorio: mkdtempSync(join(tmpdir(), 'easyway-importacion-')) }) });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo, auditoria, importacion_registros, importacion_filas, importaciones,
    pago_aplicaciones, pagos, cargos, servicios, instalaciones, gps_asignaciones, simcard_asignaciones, vehiculo_imagenes, vehiculos,
    gps, simcards, clientes, tecnicos RESTART IDENTITY CASCADE`;
  await base!.cliente`DELETE FROM planes WHERE nombre <> 'Plan Anual'`;
  await iniciar('admin', 'admin');
  await iniciar('tecnico', 'tecnico');
});

test('análisis: resumen, filas con problemas, idempotencia del archivo y validaciones de entrada', async () => {
  const { estado, datos } = await subir();
  expect(estado).toBe(201);
  const importacion = datos as ImportacionFila;
  expect(importacion).toMatchObject({ estado: 'Analizada', creado_por_nombre: 'admin' });
  expect(importacion.resumen).toMatchObject({
    hoja: 'Data de instalaciones e cliente', filas: 14, filas_validas: 11, filas_con_error: 2, filas_omitidas: 1,
    nuevos: { clientes: 6, vehiculos: 7, gps: 7, simcards: 7, instalaciones: 11, tecnicos: 6, planes: 4, tipos_servicio: 0, servicios: 3 },
  });
  // Nada se crea al analizar.
  expect(await contar('clientes')).toBe(0);

  const repetido = await subir();
  expect(repetido).toMatchObject({ estado: 409, datos: { detalles: { id: importacion.id } } });
  const problemas = (await api(`/importaciones/${importacion.id}/filas?filtro=errores`)).datos;
  expect(problemas.map((f: { errores: string[] }) => f.errores[0]).sort()).toEqual(['Fila sin IMEI', 'IMEI inválido (11 dígitos)']);

  expect((await subir(new TextEncoder().encode('no es excel'), 'x.xlsx')).datos.error).toContain('no es un Excel');
  expect((await subir(FIXTURE, 'x.xlsx', 'tecnico')).estado).toBe(403);
});

test('confirmación: decisiones de catálogo, historial de GPS/SIM, cobros desde la renovación y auditoría', async () => {
  const importacion = (await subir()).datos as ImportacionFila;
  const opciones: OpcionesImportacion = { ...importacion.opciones!, tecnicos: { ...importacion.opciones!.tecnicos, gabo: { accion: 'crear', nombre: 'Gabo Chamo' } } };
  const previa = await api(`/importaciones/${importacion.id}/previsualizar`, { cuerpo: opciones });
  expect(previa.datos.nuevos.tecnicos).toBe(5);

  const confirmada = await api(`/importaciones/${importacion.id}/confirmar`, { cuerpo: opciones });
  expect(confirmada.estado).toBe(200);
  expect(confirmada.datos).toMatchObject({ estado: 'Confirmada', confirmada_at: expect.any(String) });
  expect([await contar('clientes'), await contar('vehiculos'), await contar('gps'), await contar('simcards'), await contar('instalaciones'), await contar('tecnicos')])
    .toEqual([6, 7, 7, 7, 11, 5]);
  expect((await base!.cliente`SELECT nombre FROM tecnicos WHERE nombre LIKE 'Gabo%'`).map(t => t.nombre)).toEqual(['Gabo Chamo']);

  const historial = await base!.cliente`SELECT to_char(a.fecha_inicio AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD') AS inicio,
      to_char(a.fecha_fin AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD') AS fin, c.nombre
    FROM gps_asignaciones a JOIN gps g ON g.id = a.gps_id JOIN vehiculos v ON v.id = a.vehiculo_id JOIN clientes c ON c.id = v.cliente_id
    WHERE g.imei = '863829070000003' ORDER BY a.fecha_inicio`;
  expect(historial).toEqual([
    { inicio: '2024-02-01', fin: '2024-06-15', nombre: 'Ana Inventada Pérez' },
    { inicio: '2024-06-15', fin: null, nombre: 'Luis Ejemplo Gómez' },
  ]);
  const [gps6] = await base!.cliente`SELECT estado FROM gps WHERE imei = '863829070000006'`;
  expect(gps6.estado).toBe('Retirado');
  const servicios = await base!.cliente`SELECT proximo_cobro::text FROM servicios ORDER BY proximo_cobro`;
  expect(servicios.map(s => s.proximo_cobro)).toEqual(['2027-01-10', '2027-01-10', '2027-06-15']);
  // Cobros: generar hasta hoy no crea deuda histórica.
  expect((await api('/cargos/generar', { cuerpo: { hasta: '2026-10-18' } })).datos.creados).toBe(0);

  const notas = await base!.cliente`SELECT notas FROM instalaciones ORDER BY id LIMIT 1`;
  expect(notas[0].notas).toMatch(/^Importado del Excel \(fila \d+\)$/);
  expect((await api(`/auditoria?entidad=importacion&entidad_id=${importacion.id}`)).datos.map((a: { accion: string }) => a.accion)).toEqual(['confirmar', 'analizar']);
  expect((await api(`/importaciones/${importacion.id}/confirmar`, { cuerpo: opciones })).estado).toBe(409);
  expect((await subir()).datos.error).toBe('Este archivo ya se importó');
});

test('rollback: un conflicto a mitad de la confirmación no deja nada creado', async () => {
  const importacion = (await subir()).datos as ImportacionFila;
  // Entre el análisis y la confirmación alguien crea un plan con el mismo nombre que uno a crear.
  await api('/planes', { cuerpo: { nombre: 'Plan Mensual (oferta)', periodicidad: 'Mensual', precio: 900 } });
  const opciones = { ...importacion.opciones!, planes: { ...importacion.opciones!.planes, 'plan mensual (oferta)': { accion: 'crear', nombre: 'Plan Mensual (oferta)' } } };
  const fallo = await api(`/importaciones/${importacion.id}/confirmar`, { cuerpo: opciones });
  expect(fallo).toMatchObject({ estado: 409, datos: { error: 'Ya existe un plan con ese nombre' } });
  expect([await contar('clientes'), await contar('gps'), await contar('tecnicos'), await contar('importacion_registros')]).toEqual([0, 0, 0, 0]);
  expect((await api(`/importaciones/${importacion.id}`)).datos.estado).toBe('Analizada');

  expect((await api(`/importaciones/${importacion.id}/confirmar`, { cuerpo: { ...opciones, tipos: { ...opciones.tipos, instalacion: { accion: 'ninguno' } } } })).estado).toBe(400);
  const sinDecision = { ...opciones, tecnicos: {} };
  expect((await api(`/importaciones/${importacion.id}/confirmar`, { cuerpo: sinDecision })).datos.error).toContain('Falta decidir');
});

test('reversión: bloqueada si hay datos posteriores; después borra solo lo importado y libera el archivo', async () => {
  const importacion = (await subir()).datos as ImportacionFila;
  await api(`/importaciones/${importacion.id}/confirmar`, { cuerpo: importacion.opciones });
  const [cliente] = await base!.cliente`SELECT id FROM clientes WHERE nombre = 'Luis Ejemplo Gómez'`;
  const manual = await api('/clientes', { cuerpo: { nombre: 'Cliente creado a mano' } });
  const [vehiculo] = await base!.cliente`SELECT id FROM vehiculos WHERE cliente_id = ${cliente.id}`;
  const [equipo] = await base!.cliente`SELECT id FROM gps WHERE imei = '863829070000001'`;
  const nueva = await api('/instalaciones', { cuerpo: { vehiculo_id: vehiculo.id, gps_id: equipo.id, tipo_servicio_id: 3 } });

  const bloqueada = await api(`/importaciones/${importacion.id}/revertir`, { metodo: 'POST' });
  expect(bloqueada.estado).toBe(409);
  expect(bloqueada.datos.error).toContain('No se ha borrado nada');
  expect(await contar('instalaciones')).toBe(12);

  await api(`/instalaciones/${nueva.datos.id}`, { metodo: 'DELETE' });
  const revertida = await api(`/importaciones/${importacion.id}/revertir`, { metodo: 'POST' });
  expect(revertida.datos).toMatchObject({ estado: 'Revertida', revertida_at: expect.any(String) });
  expect([await contar('vehiculos'), await contar('gps'), await contar('simcards'), await contar('instalaciones'), await contar('servicios'), await contar('importacion_filas')])
    .toEqual([0, 0, 0, 0, 0, 0]);
  expect((await base!.cliente`SELECT nombre FROM clientes`).map(c => c.nombre)).toEqual([manual.datos.nombre]);
  expect((await base!.cliente`SELECT count(*)::int AS n FROM planes`)[0].n).toBe(1);

  const otra = await subir();
  expect(otra.estado).toBe(201);
  const descartada = await api(`/importaciones/${otra.datos.id}/descartar`, { metodo: 'POST' });
  expect(descartada.datos.estado).toBe('Descartada');
  expect(await contar('importacion_filas')).toBe(0);
  expect((await api('/importaciones')).datos.map((i: ImportacionFila) => i.estado)).toEqual(['Descartada', 'Revertida']);
});
