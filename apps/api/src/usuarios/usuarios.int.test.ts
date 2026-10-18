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
let admin: string;
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

async function entrar(identificador: string, contrasena = CLAVE) {
  const r = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador, contrasena }),
  });
  return { estado: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 4 });
  app = crearApp({
    bd: conexion.bd, enviador: { enviar: async () => {} }, produccion: false,
    almacen: crearAlmacenLocal({ directorio: mkdtempSync(join(tmpdir(), 'easyway-usuarios-')) }),
  });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo, instalaciones, tecnicos RESTART IDENTITY CASCADE`;
  await conexion.bd.insert(usuarios).values({ nombre: 'Admin', usuario: 'admin', rol: 'admin', contrasena_hash: await hashearContrasena(CLAVE) });
  admin = (await entrar('admin')).cookie!;
});

test('alta desde formulario: campos vacíos, ficha de técnico, duplicados con mensaje claro y sin exponer hashes', async () => {
  const ficha = (await api('/tecnicos', { cuerpo: { nombre: 'Pedro Martínez' } })).datos;
  const alta = await api('/usuarios', { cuerpo: { nombre: 'Pedro', usuario: 'Pedro.M', correo: '', contrasena: 'otra-clave-123', rol: 'tecnico', tecnico_id: String(ficha.id) } });
  expect(alta.estado).toBe(201);
  expect(alta.datos.usuario).toMatchObject({ usuario: 'pedro.m', correo: null, rol: 'tecnico', tecnico_id: ficha.id, tecnico_nombre: 'Pedro Martínez', activo: true });

  const lista = await api('/usuarios');
  expect(lista.datos.map((u: { usuario: string }) => u.usuario)).toEqual(['admin', 'pedro.m']);
  expect(JSON.stringify(lista.datos)).not.toMatch(/contrasena|scrypt/);

  expect((await api('/usuarios', { cuerpo: { nombre: 'Otro', usuario: 'pedro.m', contrasena: 'otra-clave-123' } })).datos.error)
    .toBe('Ya existe una cuenta con ese nombre de usuario');
  expect((await api('/usuarios', { cuerpo: { nombre: 'Otro', usuario: 'otro', contrasena: 'otra-clave-123', tecnico_id: ficha.id } })).datos.error)
    .toBe('Esa ficha de técnico ya tiene una cuenta vinculada');
  expect((await api('/usuarios', { cuerpo: { nombre: 'X', usuario: '', correo: '', contrasena: 'otra-clave-123' } })).estado).toBe(400);

  const tecnico = (await entrar('pedro.m', 'otra-clave-123')).cookie;
  expect((await api('/usuarios', { cookie: tecnico })).estado).toBe(403);
});

test('desactivar cierra las sesiones de la cuenta e impide entrar; el admin no puede desactivarse a sí mismo', async () => {
  const creado = (await api('/usuarios', { cuerpo: { nombre: 'Ana', usuario: 'ana', contrasena: CLAVE, rol: 'admin' } })).datos.usuario;
  const sesionAna = (await entrar('ana')).cookie;
  expect((await api('/auth/sesion', { cookie: sesionAna })).estado).toBe(200);

  const desactivada = await api(`/usuarios/${creado.id}`, { metodo: 'PUT', cuerpo: { nombre: 'Ana', rol: 'admin', activo: false } });
  expect(desactivada.datos).toMatchObject({ activo: false });
  expect((await api('/auth/sesion', { cookie: sesionAna })).estado).toBe(401);
  expect((await entrar('ana')).estado).toBe(403);

  const yo = (await api('/usuarios')).datos.find((u: { usuario: string }) => u.usuario === 'admin');
  expect((await api(`/usuarios/${yo.id}`, { metodo: 'PUT', cuerpo: { nombre: 'Admin', rol: 'admin', activo: false } })).estado).toBe(409);
  expect((await api(`/usuarios/${yo.id}`, { metodo: 'PUT', cuerpo: { nombre: 'Admin', rol: 'tecnico', activo: true } })).estado).toBe(409);
  const renombrado = await api(`/usuarios/${yo.id}`, { metodo: 'PUT', cuerpo: { nombre: 'Administración', rol: 'admin', activo: true } });
  expect(renombrado.datos.nombre).toBe('Administración');
  expect((await api('/auth/sesion')).estado).toBe(200);
});

test('restablecer contraseña: invalida la anterior, cierra sesiones y desbloquea la cuenta', async () => {
  const creado = (await api('/usuarios', { cuerpo: { nombre: 'Luis', usuario: 'luis', contrasena: CLAVE } })).datos.usuario;
  const sesionLuis = (await entrar('luis')).cookie;
  for (let i = 0; i < 5; i++) await entrar('luis', 'equivocada');
  expect((await api('/usuarios')).datos.find((u: { id: number }) => u.id === creado.id).bloqueado_hasta).not.toBeNull();

  expect((await api(`/usuarios/${creado.id}/contrasena`, { metodo: 'PUT', cuerpo: { contrasena: 'corta' } })).estado).toBe(400);
  expect((await api(`/usuarios/${creado.id}/contrasena`, { metodo: 'PUT', cuerpo: { contrasena: 'nueva-clave-456' } })).estado).toBe(204);
  expect((await api('/auth/sesion', { cookie: sesionLuis })).estado).toBe(401);
  expect((await entrar('luis')).estado).toBe(401);
  expect((await entrar('luis', 'nueva-clave-456')).estado).toBe(200);
});
