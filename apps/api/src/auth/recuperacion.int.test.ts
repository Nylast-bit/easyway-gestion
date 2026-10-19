import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iniciarPostgresEfimero } from '../../../../scripts/db/postgres-efimero';
import { crearApp } from '../app';
import { crearAlmacenLocal } from '../almacen/local';
import { crearBaseDatos } from '../db/cliente';
import { auditoria, sesiones, usuarios } from '../db/esquema';
import type { EnviadorCorreo, MensajeCorreo } from '../correo/enviador';
import { hashearContrasena } from './criptografia';

let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let conexion: ReturnType<typeof crearBaseDatos>;
let desfase = 0;
let enviados: MensajeCorreo[] = [];
const reloj = () => new Date(Date.now() + desfase);
const avanzar = (minutos: number) => { desfase += minutos * 60_000; };
const enviador: EnviadorCorreo = { async enviar(mensaje) { enviados.push(mensaje); } };
let app: ReturnType<typeof crearApp>;

const CLAVE = 'clave-segura-123';
const NUEVA = 'clave-nueva-456';
const CEDULA = '00112345678';
const codigoDe = (mensaje: MensajeCorreo) => mensaje.texto.match(/\b(\d{6})\b/)![1];

function solicitar(ruta: string, opciones: { cuerpo?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opciones.cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  if (opciones.cookie) headers.Cookie = opciones.cookie;
  return app.request(`/api${ruta}`, {
    method: opciones.cuerpo === undefined ? 'GET' : 'POST', headers,
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
}

const cookieDe = (respuesta: Response) => respuesta.headers.get('set-cookie')?.split(';')[0];
const entrar = (identificador: string, contrasena: string) => solicitar('/auth/login', { cuerpo: { identificador, contrasena } });

async function crearUsuario(datos: Partial<typeof usuarios.$inferInsert> & { nombre: string }) {
  const [fila] = await conexion.bd.insert(usuarios).values({ contrasena_hash: await hashearContrasena(CLAVE), ...datos }).returning();
  return fila;
}

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 4 });
  app = crearApp({ almacen: crearAlmacenLocal({ directorio: mkdtempSync(join(tmpdir(), 'easyway-almacen-')) }), bd: conexion.bd, enviador, produccion: false, reloj });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  desfase = 0;
  enviados = [];
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo, auditoria RESTART IDENTITY CASCADE`;
});

test('recuperar por correo: no revela cuentas, limita envíos y el código fija la contraseña nueva', async () => {
  const laura = await crearUsuario({ nombre: 'Laura Gómez', correo: 'laura@ejemplo.do', rol: 'admin', correo_verificado_at: new Date() });
  const vieja = cookieDe(await entrar('laura@ejemplo.do', CLAVE))!;
  // Bloqueada por intentos: recuperar la contraseña también la desbloquea.
  await conexion.bd.update(usuarios).set({ bloqueado_hasta: new Date(Date.now() + 3600_000) }).where(eq(usuarios.id, laura.id));

  // Correo desconocido: misma respuesta y ningún envío.
  const desconocido = await solicitar('/auth/recuperar', { cuerpo: { correo: 'nadie@ejemplo.do' } });
  expect(desconocido.status).toBe(202);
  expect(await desconocido.json()).toMatchObject({ correo: 'na•••@ejemplo.do', reintentarEn: 60 });
  expect(enviados).toHaveLength(0);

  const pedido = await solicitar('/auth/recuperar', { cuerpo: { correo: 'LAURA@ejemplo.do' } });
  expect(pedido.status).toBe(202);
  const { desafio, correo } = await pedido.json();
  expect(correo).toBe('la•••@ejemplo.do');
  expect(enviados).toHaveLength(1);
  expect(enviados[0].asunto).toContain('recuperación');
  expect(enviados[0].html).toContain('Restablece tu contraseña');
  expect((await solicitar('/auth/recuperar', { cuerpo: { correo: 'laura@ejemplo.do' } })).status).toBe(429);

  // El código de recuperación no sirve para verificar correo ni al revés.
  const codigo = codigoDe(enviados[0]);
  expect((await solicitar('/auth/verificar-correo', { cuerpo: { desafio, codigo } })).status).toBe(410);
  const erroneo = codigo === '000000' ? '111111' : '000000';
  const fallo = await solicitar('/auth/recuperar/confirmar', { cuerpo: { desafio, codigo: erroneo, contrasena: NUEVA } });
  expect(fallo.status).toBe(400);
  expect((await solicitar('/auth/recuperar/confirmar', { cuerpo: { desafio, codigo, contrasena: 'corta' } })).status).toBe(400);

  const ok = await solicitar('/auth/recuperar/confirmar', { cuerpo: { desafio, codigo, contrasena: NUEVA } });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toMatchObject({ estado: 'sesion_iniciada', usuario: { correo: 'laura@ejemplo.do', debe_cambiar_contrasena: false } });
  expect((await solicitar('/auth/sesion', { cookie: cookieDe(ok) })).status).toBe(200);
  // Las sesiones anteriores se cierran, el bloqueo se quita y el código no se reutiliza.
  expect((await solicitar('/auth/sesion', { cookie: vieja })).status).toBe(401);
  expect((await solicitar('/auth/recuperar/confirmar', { cuerpo: { desafio, codigo, contrasena: NUEVA } })).status).toBe(410);
  expect((await entrar('laura@ejemplo.do', CLAVE)).status).toBe(401);
  expect((await entrar('laura@ejemplo.do', NUEVA)).status).toBe(200);
  expect(await conexion.bd.select({ accion: auditoria.accion }).from(auditoria)).toEqual([{ accion: 'recuperar_por_correo' }]);

  // Máximo 5 códigos por hora y cuenta.
  for (let i = 0; i < 4; i++) {
    avanzar(1.1);
    expect((await solicitar('/auth/recuperar', { cuerpo: { correo: 'laura@ejemplo.do' } })).status).toBe(202);
  }
  avanzar(1.1);
  expect((await solicitar('/auth/recuperar', { cuerpo: { correo: 'laura@ejemplo.do' } })).status).toBe(429);
  expect(enviados).toHaveLength(5);
});

test('recuperar por cédula: contraseña temporal, cambio obligatorio antes de usar el portal', async () => {
  await crearUsuario({ nombre: 'Gabo Chamo', usuario: 'gabo', rol: 'admin', cedula: CEDULA });
  await crearUsuario({ nombre: 'Con correo', usuario: 'concorreo', correo: 'c@ejemplo.do', cedula: '00199999999' });
  const anterior = cookieDe(await entrar('gabo', CLAVE))!;

  const mensaje = { error: 'Usuario o cédula incorrectos. Si tu cuenta tiene correo, recupérala por correo.' };
  const inexistente = await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'nadie', cedula: CEDULA } });
  expect(inexistente.status).toBe(401);
  expect(await inexistente.json()).toMatchObject(mensaje);
  expect((await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'gabo', cedula: '00112345679' } })).status).toBe(401);
  // Una cuenta con correo se recupera por correo, aunque tenga cédula.
  expect((await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'concorreo', cedula: '001-9999999-9' } })).status).toBe(401);
  expect((await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'gabo', cedula: '123' } })).status).toBe(400);

  const recuperada = await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'Gabo', cedula: '001-1234567-8' } });
  expect(recuperada.status).toBe(200);
  const { contrasena_temporal } = await recuperada.json();
  expect(contrasena_temporal).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  expect((await solicitar('/auth/sesion', { cookie: anterior })).status).toBe(401);
  expect((await entrar('gabo', CLAVE)).status).toBe(401);

  const login = await entrar('gabo', contrasena_temporal);
  expect(login.status).toBe(200);
  expect(await login.json()).toMatchObject({ usuario: { debe_cambiar_contrasena: true } });
  const cookie = cookieDe(login)!;
  // Mientras no la cambie, el resto de la API responde 403; la sesión sí se puede consultar.
  const bloqueada = await solicitar('/resumen', { cookie });
  expect(bloqueada.status).toBe(403);
  expect(await bloqueada.json()).toMatchObject({ detalles: { cambiar_contrasena: true } });
  expect((await solicitar('/auth/sesion', { cookie })).status).toBe(200);

  expect((await solicitar('/auth/cambiar-contrasena', { cuerpo: { actual: 'otra-cosa', nueva: NUEVA }, cookie })).status).toBe(400);
  expect((await solicitar('/auth/cambiar-contrasena', { cuerpo: { actual: contrasena_temporal, nueva: contrasena_temporal }, cookie })).status).toBe(400);
  const cambio = await solicitar('/auth/cambiar-contrasena', { cuerpo: { actual: contrasena_temporal, nueva: NUEVA }, cookie });
  expect(cambio.status).toBe(200);
  expect(await cambio.json()).toMatchObject({ usuario: { debe_cambiar_contrasena: false } });
  expect((await solicitar('/resumen', { cookie })).status).toBe(200);
  expect((await entrar('gabo', NUEVA)).status).toBe(200);
  expect((await conexion.bd.select({ accion: auditoria.accion }).from(auditoria)).map(f => f.accion))
    .toEqual(['recuperar_por_cedula', 'cambiar_contrasena']);
});

test('recuperar por cédula: los fallos bloquean la cuenta igual que la contraseña', async () => {
  await crearUsuario({ nombre: 'Darian', usuario: 'darian', cedula: CEDULA });
  for (let i = 0; i < 4; i++) expect((await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'darian', cedula: '00100000000' } })).status).toBe(401);
  expect((await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'darian', cedula: '00100000000' } })).status).toBe(423);
  expect((await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'darian', cedula: CEDULA } })).status).toBe(423);
  avanzar(16);
  expect((await solicitar('/auth/recuperar/cedula', { cuerpo: { usuario: 'darian', cedula: CEDULA } })).status).toBe(200);
});

test('admin: cédula única en la cuenta; alta y restablecimiento exigen cambiar la contraseña al entrar', async () => {
  await crearUsuario({ nombre: 'Admin', usuario: 'admin', rol: 'admin' });
  const admin = cookieDe(await entrar('admin', CLAVE))!;
  const creado = await solicitar('/usuarios', { cookie: admin, cuerpo: { nombre: 'Elian', usuario: 'elian', contrasena: CLAVE, cedula: '402-1234567-1' } });
  expect(creado.status).toBe(201);
  const { usuario } = await creado.json();
  expect(usuario).toMatchObject({ cedula: '40212345671' });
  const repetida = await solicitar('/usuarios', { cookie: admin, cuerpo: { nombre: 'Otro', usuario: 'otro', contrasena: CLAVE, cedula: '40212345671' } });
  expect(repetida.status).toBe(409);
  expect(await repetida.json()).toMatchObject({ error: 'Ya existe una cuenta con esa cédula' });

  expect(await (await entrar('elian', CLAVE)).json()).toMatchObject({ usuario: { debe_cambiar_contrasena: true } });
  const [fila] = await conexion.bd.select().from(usuarios).where(eq(usuarios.id, usuario.id));
  expect(fila.debe_cambiar_contrasena).toBe(true);
  expect(await conexion.bd.select().from(sesiones).where(eq(sesiones.usuario_id, usuario.id))).toHaveLength(1);
});
