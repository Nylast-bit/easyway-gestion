import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { iniciarPostgresEfimero } from '../../../../scripts/db/postgres-efimero';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearApp } from '../app';
import { crearAlmacenLocal } from '../almacen/local';
import { crearBaseDatos } from '../db/cliente';
import { gps, gpsAsignaciones, simcardAsignaciones, usuarios, vehiculos } from '../db/esquema';
import { hashearContrasena } from '../auth/criptografia';

let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let conexion: ReturnType<typeof crearBaseDatos>;
let app: ReturnType<typeof crearApp>;
let admin: string;
let tecnico: string;

const CLAVE = 'clave-segura-123';

async function api(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; cookie?: string } = {}) {
  const respuesta = await app.request(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
    headers: { ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: opciones.cookie ?? admin },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, datos: texto ? JSON.parse(texto) : null };
}
const crear = async (ruta: string, cuerpo: unknown) => {
  const r = await api(ruta, { cuerpo });
  if (r.estado !== 201) throw new Error(`${ruta}: ${r.estado} ${JSON.stringify(r.datos)}`);
  return r.datos;
};
const actualizar = (ruta: string, cuerpo: unknown) => api(ruta, { metodo: 'PUT', cuerpo });
const estadoGps = async (id: number) => (await conexion.bd.select({ estado: gps.estado }).from(gps).where(eq(gps.id, id)))[0].estado;
const activasDeVehiculo = (id: number) => conexion.bd.select().from(gpsAsignaciones)
  .where(and(eq(gpsAsignaciones.vehiculo_id, id), isNull(gpsAsignaciones.fecha_fin)));

let imeiSecuencia = 0;
const nuevoImei = () => `86382907${String(++imeiSecuencia).padStart(7, '0')}`;

async function iniciar(usuario: string, rol: 'admin' | 'tecnico') {
  await conexion.bd.insert(usuarios).values({ nombre: usuario, usuario, rol, contrasena_hash: await hashearContrasena(CLAVE) });
  const respuesta = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: usuario, contrasena: CLAVE }),
  });
  return respuesta.headers.get('set-cookie')!.split(';')[0];
}

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 6 });
  app = crearApp({ almacen: crearAlmacenLocal({ directorio: mkdtempSync(join(tmpdir(), 'easyway-almacen-')) }), bd: conexion.bd, enviador: { enviar: async () => {} }, produccion: false });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo, instalaciones, gps_asignaciones,
    simcard_asignaciones, vehiculo_imagenes, vehiculos, gps, simcards, clientes, tecnicos RESTART IDENTITY CASCADE`;
  admin = await iniciar('admin', 'admin');
  tecnico = await iniciar('tecnico', 'tecnico');
});

test('autorización: sin sesión 401 y rol técnico 403 en todas las rutas de gestión', async () => {
  for (const ruta of ['/resumen', '/buscar?q=a', '/clientes', '/tecnicos', '/vehiculos', '/gps', '/simcards', '/instalaciones']) {
    expect((await api(ruta, { cookie: 'easyway_sesion=invalida' })).estado).toBe(401);
    expect((await api(ruta, { cookie: tecnico })).estado).toBe(403);
    expect((await api(ruta)).estado).toBe(200);
  }
  expect((await api('/clientes', { cuerpo: { nombre: 'X' }, cookie: tecnico })).estado).toBe(403);
});

test('clientes: normaliza, actualiza, valida y no borra si tiene vehículos', async () => {
  const cliente = await crear('/clientes', { nombre: '  Transporte Caribe ', telefono: '(809) 555-0101', correo: 'INFO@Caribe.do' });
  expect(cliente).toMatchObject({ nombre: 'Transporte Caribe', telefono: '8095550101', correo: 'info@caribe.do' });
  expect((await actualizar(`/clientes/${cliente.id}`, { nombre: 'Caribe SRL', telefono: '', correo: '' })).datos)
    .toMatchObject({ nombre: 'Caribe SRL', telefono: null, correo: null });
  expect((await actualizar('/clientes/9999', { nombre: 'X' })).estado).toBe(404);
  expect((await api('/clientes', { cuerpo: { nombre: '' } })).estado).toBe(400);

  await crear('/vehiculos', { cliente_id: cliente.id, marca: 'toyota' });
  const borrado = await api(`/clientes/${cliente.id}`, { metodo: 'DELETE' });
  expect(borrado.estado).toBe(409);
  expect(borrado.datos.error).toContain('relacionado');
  const libre = await crear('/clientes', { nombre: 'Sin vehículos' });
  expect((await api(`/clientes/${libre.id}`, { metodo: 'DELETE' })).estado).toBe(204);
});

test('vehículo con GPS: asignación, cambio, conservación y retirada dentro de transacciones', async () => {
  const cliente = await crear('/clientes', { nombre: 'Ana' });
  const g1 = await crear('/gps', { imei: nuevoImei(), modelo: 'FMB920' });
  const g2 = await crear('/gps', { imei: nuevoImei() });
  const vehiculo = await crear('/vehiculos', { cliente_id: cliente.id, marca: 'honda', placa: 'a123', gps_id: g1.id });
  expect(vehiculo).toMatchObject({ marca: 'HONDA', placa: 'A123', cliente_nombre: 'Ana', gps: { id: g1.id, modelo: 'FMB920' } });
  expect(await estadoGps(g1.id)).toBe('Instalado');

  const sinCampo = await actualizar(`/vehiculos/${vehiculo.id}`, { cliente_id: cliente.id, marca: 'honda', color: 'rojo' });
  expect(sinCampo.datos).toMatchObject({ color: 'ROJO', gps: { id: g1.id } });

  const cambio = await actualizar(`/vehiculos/${vehiculo.id}`, { cliente_id: cliente.id, marca: 'honda', gps_id: g2.id });
  expect(cambio.datos.gps.id).toBe(g2.id);
  expect([await estadoGps(g1.id), await estadoGps(g2.id)]).toEqual(['Disponible', 'Instalado']);
  const historial = await conexion.bd.select().from(gpsAsignaciones).where(eq(gpsAsignaciones.vehiculo_id, vehiculo.id));
  expect(historial).toHaveLength(2);
  expect(historial.filter(h => h.fecha_fin === null).map(h => h.gps_id)).toEqual([g2.id]);

  const retirado = await actualizar(`/vehiculos/${vehiculo.id}`, { cliente_id: cliente.id, gps_id: null });
  expect(retirado.datos.gps).toBeNull();
  expect(await estadoGps(g2.id)).toBe('Disponible');
  expect(await activasDeVehiculo(vehiculo.id)).toHaveLength(0);
});

test('rollback: un GPS no disponible revierte la creación y la edición completas', async () => {
  const cliente = await crear('/clientes', { nombre: 'Luis' });
  const g1 = await crear('/gps', { imei: nuevoImei() });
  const danado = await crear('/gps', { imei: nuevoImei(), estado: 'Dañado' });
  const vehiculo = await crear('/vehiculos', { cliente_id: cliente.id, marca: 'kia', gps_id: g1.id });

  const otro = await api('/vehiculos', { cuerpo: { cliente_id: cliente.id, marca: 'mazda', gps_id: g1.id } });
  expect(otro.estado).toBe(409);
  expect(otro.datos.error).toContain('no está disponible');
  expect(await conexion.bd.select().from(vehiculos)).toHaveLength(1);

  const edicion = await actualizar(`/vehiculos/${vehiculo.id}`, { cliente_id: cliente.id, marca: 'cambiada', gps_id: danado.id });
  expect(edicion.estado).toBe(409);
  // Ni el cambio de marca ni el cierre de la asignación anterior quedaron aplicados.
  const [fila] = await conexion.bd.select().from(vehiculos).where(eq(vehiculos.id, vehiculo.id));
  expect(fila.marca).toBe('KIA');
  expect((await activasDeVehiculo(vehiculo.id)).map(a => a.gps_id)).toEqual([g1.id]);
  expect(await estadoGps(g1.id)).toBe('Instalado');
});

test('concurrencia: dos vehículos piden el mismo GPS a la vez y solo uno lo obtiene', async () => {
  const cliente = await crear('/clientes', { nombre: 'Flota' });
  const equipo = await crear('/gps', { imei: nuevoImei() });
  const resultados = await Promise.all([1, 2, 3].map(n =>
    api('/vehiculos', { cuerpo: { cliente_id: cliente.id, placa: `P${n}`, gps_id: equipo.id } })));
  expect(resultados.map(r => r.estado).sort()).toEqual([201, 409, 409]);
  expect(await conexion.bd.select().from(vehiculos)).toHaveLength(1);
  expect(await conexion.bd.select().from(gpsAsignaciones)).toHaveLength(1);
});

test('GPS y simcards: asignación, historial, estados y retirada del vehículo al dañarse', async () => {
  const s1 = await crear('/simcards', { numero: '809-180-2704', fecha_vencimiento: '2027-01-31' });
  const s2 = await crear('/simcards', { numero: '8091112222' });
  expect(s1).toMatchObject({ numero: '8091802704', estado: 'Disponible', gps: null });
  const imei = nuevoImei();
  const equipo = await crear('/gps', { imei, simcard_id: s1.id });
  expect(equipo.simcard).toEqual({ id: s1.id, numero: '8091802704' });
  expect((await api(`/simcards/${s1.id}`)).datos).toMatchObject({ estado: 'Asignada', gps: { id: equipo.id } });

  const duplicado = await api('/gps', { cuerpo: { imei: nuevoImei(), simcard_id: s1.id } });
  expect(duplicado.estado).toBe(409);
  expect((await api('/gps')).datos).toHaveLength(1);
  expect((await api('/gps', { cuerpo: { imei } })).datos.error).toBe('Ya existe un GPS con ese IMEI');
  expect((await api('/gps', { cuerpo: { imei: '123' } })).estado).toBe(400);

  await actualizar(`/gps/${equipo.id}`, { imei, simcard_id: s2.id });
  expect((await api('/simcards?estado=Disponible')).datos.map((s: { id: number }) => s.id)).toEqual([s1.id]);
  const historial = (await api(`/simcards/${s1.id}/historial`)).datos;
  expect(historial).toHaveLength(1);
  expect(historial[0].fecha_fin).not.toBeNull();

  const cliente = await crear('/clientes', { nombre: 'Rosa' });
  const vehiculo = await crear('/vehiculos', { cliente_id: cliente.id, gps_id: equipo.id });
  expect((await api(`/gps/${equipo.id}`)).datos.vehiculo.id).toBe(vehiculo.id);
  const danado = await actualizar(`/gps/${equipo.id}`, { imei, estado: 'Dañado' });
  expect(danado.datos).toMatchObject({ estado: 'Dañado', vehiculo: null, simcard: { id: s2.id } });
  expect(await activasDeVehiculo(vehiculo.id)).toHaveLength(0);
  expect(await conexion.bd.select().from(simcardAsignaciones).where(isNull(simcardAsignaciones.fecha_fin))).toHaveLength(1);
});

test('instalaciones, resumen y búsqueda global', async () => {
  const cliente = await crear('/clientes', { nombre: 'Cliente 50% Norte' });
  const otro = await crear('/clientes', { nombre: 'Otro' });
  const tec = await crear('/tecnicos', { nombre: 'Pedro' });
  const equipo = await crear('/gps', { imei: nuevoImei() });
  const vehiculo = await crear('/vehiculos', { cliente_id: cliente.id, marca: 'isuzu', placa: 'L000123' });
  const instalacion = await crear('/instalaciones', {
    tipo_servicio_id: 1, vehiculo_id: vehiculo.id, gps_id: equipo.id, tecnico_id: tec.id, simcard_id: '',
    fecha_instalacion: '2026-10-18T16:30:00.000Z', asunto: 'Nueva unidad',
  });
  expect(instalacion).toMatchObject({
    tipo: 'Instalación', estado: 'En Proceso', fecha_instalacion: '2026-10-18T16:30:00.000Z', tecnico_nombre: 'Pedro',
    gps_imei: equipo.imei, simcard_numero: null, vehiculo: { placa: 'L000123', cliente_nombre: 'Cliente 50% Norte' },
  });
  const editada = await actualizar(`/instalaciones/${instalacion.id}`, { ...instalacion, simcard_id: null, estado: 'Completado', tecnico_id: null });
  expect(editada.datos).toMatchObject({ estado: 'Completado', tecnico_nombre: null });
  expect((await api(`/tecnicos/${tec.id}`, { metodo: 'DELETE' })).estado).toBe(204);
  expect((await api('/instalaciones', { cuerpo: { tipo_servicio_id: 1, vehiculo_id: 999, gps_id: equipo.id } })).estado).toBe(409);

  expect((await api('/resumen')).datos).toEqual({ clientes: 2, vehiculos: 1, gps: 1, simcards: 0 });
  const busqueda = (await api('/buscar?q=50%25')).datos;
  expect(busqueda).toEqual([{ tipo: 'cliente', id: cliente.id, etiqueta: 'Cliente 50% Norte' }]);
  expect((await api('/buscar?q=l0001')).datos).toEqual([{ tipo: 'vehiculo', id: vehiculo.id, etiqueta: 'ISUZU (L000123)' }]);
  expect((await api(`/vehiculos?cliente_id=${otro.id}`)).datos).toEqual([]);
  expect((await api(`/instalaciones/${instalacion.id}`, { metodo: 'DELETE' })).estado).toBe(204);
});
