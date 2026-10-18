import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { iniciarPostgresEfimero } from '../../../../scripts/db/postgres-efimero';
import { crearApp } from '../app';
import { crearBaseDatos } from '../db/cliente';
import { usuarios, vehiculoImagenes } from '../db/esquema';
import { hashearContrasena } from '../auth/criptografia';
import { crearAlmacenLocal } from '../almacen/local';
import type { AlmacenArchivos } from '../almacen/almacen';

let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let conexion: ReturnType<typeof crearBaseDatos>;
let app: ReturnType<typeof crearApp>;
let directorio: string;
let desfase = 0;
let fallarBorrado = false;
const reloj = () => new Date(Date.now() + desfase);
const sesiones: Record<string, string> = {};
const CLAVE = 'clave-segura-123';

// JPEG mínimo válido por firma; el contenido real no importa al almacén.
const jpeg = (relleno = 64) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(relleno).fill(0x11), 0xff, 0xd9]);

async function api(ruta: string, quien: string, opciones: { metodo?: string; cuerpo?: unknown } = {}) {
  const respuesta = await app.request(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
    headers: { ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: sesiones[quien] },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, datos: texto ? JSON.parse(texto) : null };
}

async function subirFoto(quien: string, vehiculoId: number, datos: Uint8Array = jpeg(), cabeceras: Record<string, string> = {}) {
  const formulario = new FormData();
  formulario.set('vehiculo_id', String(vehiculoId));
  formulario.set('archivo', new File([datos as Uint8Array<ArrayBuffer>], 'foto.jpg', { type: 'image/jpeg' }));
  const respuesta = await app.request('/api/fotos', { method: 'POST', body: formulario, headers: { Cookie: sesiones[quien], ...cabeceras } });
  return { estado: respuesta.status, datos: await respuesta.json() };
}

async function iniciar(usuario: string, rol: 'admin' | 'tecnico', tecnico_id: number | null = null) {
  await conexion.bd.insert(usuarios).values({ nombre: usuario, usuario, rol, tecnico_id, contrasena_hash: await hashearContrasena(CLAVE) });
  const respuesta = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: usuario, contrasena: CLAVE }),
  });
  sesiones[usuario] = respuesta.headers.get('set-cookie')!.split(';')[0];
}

// Escenario: dos técnicos con una instalación cada uno, en vehículos distintos.
let escenario: { vehiculoA: number; vehiculoB: number; instalacionA: number; instalacionB: number };

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 6 });
  directorio = mkdtempSync(join(tmpdir(), 'easyway-fotos-'));
  const local = crearAlmacenLocal({ directorio, reloj });
  const almacen: AlmacenArchivos = {
    ...local,
    borrar: async rutas => { if (fallarBorrado) throw new Error('Storage caído'); await local.borrar(rutas); },
  };
  app = crearApp({ bd: conexion.bd, enviador: { enviar: async () => {} }, almacen, produccion: false, reloj });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  desfase = 0;
  fallarBorrado = false;
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo, instalaciones, gps_asignaciones,
    simcard_asignaciones, vehiculo_imagenes, vehiculos, gps, simcards, clientes, tecnicos RESTART IDENTITY CASCADE`;
  await iniciar('admin', 'admin');
  const crear = async (ruta: string, cuerpo: unknown) => (await api(ruta, 'admin', { cuerpo })).datos;
  const tecA = await crear('/tecnicos', { nombre: 'Técnico A' });
  const tecB = await crear('/tecnicos', { nombre: 'Técnico B' });
  const cliente = await crear('/clientes', { nombre: 'Cliente' });
  const vehiculoA = (await crear('/vehiculos', { cliente_id: cliente.id, placa: 'A1' })).id;
  const vehiculoB = (await crear('/vehiculos', { cliente_id: cliente.id, placa: 'B1' })).id;
  const g1 = await crear('/gps', { imei: '863829070000001' });
  const g2 = await crear('/gps', { imei: '863829070000002' });
  const instalacionA = (await crear('/instalaciones', { tipo_servicio_id: 1, vehiculo_id: vehiculoA, gps_id: g1.id, tecnico_id: tecA.id })).id;
  const instalacionB = (await crear('/instalaciones', { tipo_servicio_id: 1, vehiculo_id: vehiculoB, gps_id: g2.id, tecnico_id: tecB.id })).id;
  escenario = { vehiculoA, vehiculoB, instalacionA, instalacionB };
  await iniciar('tecnico.a', 'tecnico', tecA.id);
  await iniciar('tecnico.b', 'tecnico', tecB.id);
  await iniciar('sin.ficha', 'tecnico');
});

test('técnicos: solo ven y actualizan el avance de sus instalaciones', async () => {
  const { instalacionA, instalacionB } = escenario;
  const lista = await api('/instalaciones', 'tecnico.a');
  expect(lista.datos.map((i: { id: number }) => i.id)).toEqual([instalacionA]);
  expect((await api(`/instalaciones/${instalacionB}`, 'tecnico.a')).estado).toBe(404);
  expect((await api('/instalaciones', 'admin')).datos).toHaveLength(2);

  const avance = await api(`/instalaciones/${instalacionA}/avance`, 'tecnico.a', { metodo: 'PATCH', cuerpo: { estado: 'Completado', notas: 'Probado en ruta' } });
  expect(avance.datos).toMatchObject({ estado: 'Completado', notas: 'Probado en ruta' });
  expect((await api(`/instalaciones/${instalacionB}/avance`, 'tecnico.a', { metodo: 'PATCH', cuerpo: { estado: 'Cancelado' } })).estado).toBe(404);
  expect((await api(`/instalaciones/${instalacionB}`, 'admin')).datos.estado).toBe('En Proceso');

  expect((await api(`/instalaciones/${instalacionA}`, 'tecnico.a', { metodo: 'PUT', cuerpo: {} })).estado).toBe(403);
  expect((await api(`/instalaciones/${instalacionA}`, 'tecnico.a', { metodo: 'DELETE' })).estado).toBe(403);
  expect((await api('/instalaciones', 'tecnico.a', { cuerpo: {} })).estado).toBe(403);
  expect((await api('/instalaciones', 'sin.ficha')).estado).toBe(403);
  for (const ruta of ['/vehiculos', '/clientes', '/gps', '/resumen']) expect((await api(ruta, 'tecnico.a')).estado).toBe(403);
});

test('fotos: subida autorizada, URL temporal que caduca y aislamiento por vehículo', async () => {
  const { vehiculoA, vehiculoB } = escenario;
  const subida = await subirFoto('tecnico.a', vehiculoA);
  expect(subida.estado).toBe(201);
  expect(subida.datos).toMatchObject({ propia: true, autor: 'tecnico.a' });
  expect((await subirFoto('tecnico.a', vehiculoB)).estado).toBe(404);
  expect((await api(`/fotos?vehiculo_id=${vehiculoB}`, 'tecnico.a')).estado).toBe(404);

  const [foto] = (await api(`/fotos?vehiculo_id=${vehiculoA}`, 'tecnico.a')).datos;
  const [fila] = await conexion.bd.select().from(vehiculoImagenes).where(eq(vehiculoImagenes.id, foto.id));
  expect(fila.storage_path).toMatch(new RegExp(`^vehiculos/${vehiculoA}/[0-9a-f-]{36}\\.jpg$`));
  expect(foto.url).not.toContain(fila.storage_path);

  // El enlace funciona sin cookie (lo usa <img>), sirve el contenido y caduca a los 10 minutos.
  const descarga = await app.request(foto.url);
  expect(descarga.status).toBe(200);
  expect(descarga.headers.get('content-type')).toBe('image/jpeg');
  expect(new Uint8Array(await descarga.arrayBuffer())).toEqual(jpeg());
  expect((await app.request(foto.url.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A')))).status).toBe(404);
  desfase = 11 * 60_000;
  expect((await app.request(foto.url)).status).toBe(404);

  const listaAdmin = await api(`/vehiculos/${vehiculoA}`, 'admin');
  expect(listaAdmin.datos).toMatchObject({ imagenes: 1, miniatura: expect.stringContaining('/api/archivos/') });
});

test('fotos: validación de formato, tamaño, origen y límite de cinco por vehículo', async () => {
  const { vehiculoA } = escenario;
  expect((await subirFoto('admin', vehiculoA, new TextEncoder().encode('<svg onload=alert(1)>'))).estado).toBe(415);
  expect((await subirFoto('admin', vehiculoA, jpeg(9 * 1024 * 1024))).estado).toBe(413);
  expect((await subirFoto('admin', vehiculoA, jpeg(), { 'Sec-Fetch-Site': 'cross-site' })).estado).toBe(403);
  const resultados = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(() => subirFoto('admin', vehiculoA)));
  expect(resultados.filter(r => r.estado === 201)).toHaveLength(5);
  expect(resultados.filter(r => r.estado === 409)).toHaveLength(2);
  expect(await conexion.bd.select().from(vehiculoImagenes)).toHaveLength(5);
});

test('fotos: un técnico solo borra las suyas; si Storage falla el registro se conserva', async () => {
  const { vehiculoA, instalacionA } = escenario;
  // El técnico B también trabaja en el vehículo A: puede ver sus fotos pero no borrar las de A.
  const tecB = (await api('/tecnicos', 'admin')).datos.find((t: { nombre: string }) => t.nombre === 'Técnico B').id;
  const gps = (await api('/gps', 'admin', { cuerpo: { imei: '863829070000003' } })).datos;
  await api('/instalaciones', 'admin', { cuerpo: { vehiculo_id: vehiculoA, gps_id: gps.id, tecnico_id: tecB, tipo_servicio_id: 3 } });
  const fotoA = (await subirFoto('tecnico.a', vehiculoA)).datos;
  const vistaB = (await api(`/fotos?vehiculo_id=${vehiculoA}`, 'tecnico.b')).datos;
  expect(vistaB).toEqual([expect.objectContaining({ id: fotoA.id, propia: false })]);
  expect((await api(`/fotos/${fotoA.id}`, 'tecnico.b', { metodo: 'DELETE' })).estado).toBe(403);

  fallarBorrado = true;
  expect((await api(`/fotos/${fotoA.id}`, 'tecnico.a', { metodo: 'DELETE' })).estado).toBe(502);
  expect(await conexion.bd.select().from(vehiculoImagenes)).toHaveLength(1);
  fallarBorrado = false;
  const [fila] = await conexion.bd.select().from(vehiculoImagenes);
  expect(existsSync(join(directorio, fila.storage_path))).toBe(true);
  expect((await api(`/fotos/${fotoA.id}`, 'tecnico.a', { metodo: 'DELETE' })).estado).toBe(204);
  expect(existsSync(join(directorio, fila.storage_path))).toBe(false);
  expect(instalacionA).toBeGreaterThan(0);
});

test('borrar vehículo: sin historial elimina también sus fotos; con historial no toca nada', async () => {
  const { vehiculoA } = escenario;
  const cliente = (await api('/clientes', 'admin', { cuerpo: { nombre: 'Temporal' } })).datos;
  const libre = (await api('/vehiculos', 'admin', { cuerpo: { cliente_id: cliente.id } })).datos;
  await subirFoto('admin', libre.id);
  const fotoConHistorial = (await subirFoto('admin', vehiculoA)).datos;
  const rutas = await conexion.bd.select().from(vehiculoImagenes);

  expect((await api(`/vehiculos/${vehiculoA}`, 'admin', { metodo: 'DELETE' })).estado).toBe(409);
  expect((await api(`/fotos?vehiculo_id=${vehiculoA}`, 'admin')).datos.map((f: { id: number }) => f.id)).toEqual([fotoConHistorial.id]);

  expect((await api(`/vehiculos/${libre.id}`, 'admin', { metodo: 'DELETE' })).estado).toBe(204);
  const rutaLibre = rutas.find(r => r.vehiculo_id === libre.id)!.storage_path;
  expect(existsSync(join(directorio, rutaLibre))).toBe(false);
  expect(await conexion.bd.select().from(vehiculoImagenes)).toHaveLength(1);
});
