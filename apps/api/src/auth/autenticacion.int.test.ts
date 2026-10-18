import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { iniciarPostgresEfimero } from '../../../../scripts/db/postgres-efimero';
import { crearApp } from '../app';
import { crearBaseDatos } from '../db/cliente';
import { usuarios, verificacionesCorreo } from '../db/esquema';
import type { EnviadorCorreo, MensajeCorreo } from '../correo/enviador';
import { hashearContrasena } from './criptografia';

let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let conexion: ReturnType<typeof crearBaseDatos>;
let desfase = 0;
let enviados: MensajeCorreo[] = [];
let fallarEnvio = false;
const reloj = () => new Date(Date.now() + desfase);
const avanzar = (minutos: number) => { desfase += minutos * 60_000; };
const enviador: EnviadorCorreo = {
  async enviar(mensaje) {
    if (fallarEnvio) throw new Error('proveedor caído');
    enviados.push(mensaje);
  },
};
let app: ReturnType<typeof crearApp>;

const CLAVE = 'clave-segura-123';
const codigoDe = (mensaje: MensajeCorreo) => mensaje.texto.match(/\b(\d{6})\b/)![1];

function solicitar(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opciones.cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  if (opciones.cookie) headers.Cookie = opciones.cookie;
  return app.request(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'), headers,
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
}

function cookieDe(respuesta: Response) {
  const valor = respuesta.headers.get('set-cookie');
  return valor ? valor.split(';')[0] : undefined;
}

async function crearUsuario(datos: Partial<typeof usuarios.$inferInsert> & { nombre: string }) {
  const [fila] = await conexion.bd.insert(usuarios).values({ contrasena_hash: await hashearContrasena(CLAVE), ...datos }).returning();
  return fila;
}

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  conexion = crearBaseDatos(base.url, { max: 4 });
  app = crearApp({ bd: conexion.bd, enviador, produccion: false, reloj });
}, 180000);

afterAll(async () => {
  await conexion?.cerrar();
  await base?.detener();
});

beforeEach(async () => {
  desfase = 0;
  enviados = [];
  fallarEnvio = false;
  await base!.cliente`TRUNCATE usuarios, sesiones, verificaciones_correo RESTART IDENTITY CASCADE`;
});

test('usuario sin correo: inicia sesión sin OTP, cookie httpOnly, sesión y cierre', async () => {
  await crearUsuario({ nombre: 'Técnico Uno', usuario: 'tecnico1' });
  const login = await solicitar('/auth/login', { cuerpo: { identificador: 'Tecnico1', contrasena: CLAVE } });
  expect(login.status).toBe(200);
  expect(await login.json()).toMatchObject({ estado: 'sesion_iniciada', usuario: { usuario: 'tecnico1', rol: 'tecnico' } });
  expect(login.headers.get('set-cookie')).toMatch(/easyway_sesion=.+HttpOnly.*SameSite=Lax/i);
  expect(enviados).toHaveLength(0);
  const cookie = cookieDe(login)!;

  const sesion = await solicitar('/auth/sesion', { cookie });
  expect(sesion.status).toBe(200);
  expect(await sesion.json()).toMatchObject({ usuario: { nombre: 'Técnico Uno' } });
  expect(sesion.headers.get('cache-control')).toBe('no-store');

  expect((await solicitar('/auth/logout', { metodo: 'POST', cookie })).status).toBe(204);
  expect((await solicitar('/auth/sesion', { cookie })).status).toBe(401);
});

test('mismo mensaje para cuenta inexistente y contraseña incorrecta; bloqueo temporal tras 5 fallos', async () => {
  await crearUsuario({ nombre: 'Ana', usuario: 'ana' });
  const inexistente = await solicitar('/auth/login', { cuerpo: { identificador: 'nadie', contrasena: CLAVE } });
  const incorrecta = await solicitar('/auth/login', { cuerpo: { identificador: 'ana', contrasena: 'otra-clave' } });
  expect(inexistente.status).toBe(401);
  expect(await inexistente.json()).toEqual(await incorrecta.json());

  for (let i = 0; i < 3; i++) expect((await solicitar('/auth/login', { cuerpo: { identificador: 'ana', contrasena: 'x' } })).status).toBe(401);
  const quinto = await solicitar('/auth/login', { cuerpo: { identificador: 'ana', contrasena: 'x' } });
  expect(quinto.status).toBe(423);
  expect((await quinto.json()).error).toContain('15 min');
  expect((await solicitar('/auth/login', { cuerpo: { identificador: 'ana', contrasena: CLAVE } })).status).toBe(423);

  avanzar(16);
  expect((await solicitar('/auth/login', { cuerpo: { identificador: 'ana', contrasena: CLAVE } })).status).toBe(200);
  const [fila] = await conexion.bd.select().from(usuarios).where(eq(usuarios.usuario, 'ana'));
  expect(fila).toMatchObject({ intentos_fallidos: 0, bloqueado_hasta: null });
});

test('cuenta con correo: OTP por correo, reenvío con espera y verificación única', async () => {
  await crearUsuario({ nombre: 'Laura Gómez', correo: 'laura@ejemplo.do', rol: 'admin' });
  const login = await solicitar('/auth/login', { cuerpo: { identificador: 'LAURA@ejemplo.do', contrasena: CLAVE } });
  expect(login.status).toBe(202);
  expect(login.headers.get('set-cookie')).toBeNull();
  const { desafio, correo, reintentarEn } = await login.json();
  expect(correo).toBe('la•••@ejemplo.do');
  expect(reintentarEn).toBe(60);
  expect(enviados).toHaveLength(1);
  expect(enviados[0]).toMatchObject({ para: 'laura@ejemplo.do' });
  const primero = codigoDe(enviados[0]);
  expect(enviados[0].html).toContain('#00b494');

  const erroneo = primero === '000000' ? '111111' : '000000';
  const fallo = await solicitar('/auth/verificar-correo', { cuerpo: { desafio, codigo: erroneo } });
  expect(fallo.status).toBe(400);
  expect((await fallo.json()).error).toContain('4 intentos');

  expect((await solicitar('/auth/reenviar-codigo', { cuerpo: { desafio } })).status).toBe(429);
  avanzar(1.1);
  expect((await solicitar('/auth/reenviar-codigo', { cuerpo: { desafio } })).status).toBe(200);
  expect(enviados).toHaveLength(2);
  const segundo = codigoDe(enviados[1]);
  if (segundo !== primero) {
    expect((await solicitar('/auth/verificar-correo', { cuerpo: { desafio, codigo: primero } })).status).toBe(400);
  }

  const ok = await solicitar('/auth/verificar-correo', { cuerpo: { desafio, codigo: segundo } });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toMatchObject({ estado: 'sesion_iniciada', usuario: { correo: 'laura@ejemplo.do', rol: 'admin' } });
  expect((await solicitar('/auth/sesion', { cookie: cookieDe(ok) })).status).toBe(200);
  expect((await solicitar('/auth/verificar-correo', { cuerpo: { desafio, codigo: segundo } })).status).toBe(410);

  // Verificado una vez: los siguientes inicios de sesión no piden código.
  const despues = await solicitar('/auth/login', { cuerpo: { identificador: 'laura@ejemplo.do', contrasena: CLAVE } });
  expect(despues.status).toBe(200);
  expect(enviados).toHaveLength(2);
});

test('OTP: agota intentos, caduca y un login nuevo invalida el desafío anterior', async () => {
  await crearUsuario({ nombre: 'Pedro', correo: 'pedro@ejemplo.do', usuario: 'pedro' });
  // Tener correo sin verificar exige OTP aunque se entre con el nombre de usuario.
  const primero = await (await solicitar('/auth/login', { cuerpo: { identificador: 'pedro', contrasena: CLAVE } })).json();
  const codigo = codigoDe(enviados[0]);
  const erroneo = codigo === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await solicitar('/auth/verificar-correo', { cuerpo: { desafio: primero.desafio, codigo: erroneo } });
  expect((await solicitar('/auth/verificar-correo', { cuerpo: { desafio: primero.desafio, codigo } })).status).toBe(429);

  const segundo = await (await solicitar('/auth/login', { cuerpo: { identificador: 'pedro@ejemplo.do', contrasena: CLAVE } })).json();
  expect((await solicitar('/auth/reenviar-codigo', { cuerpo: { desafio: primero.desafio } })).status).toBe(410);
  avanzar(11);
  const caducado = await solicitar('/auth/verificar-correo', { cuerpo: { desafio: segundo.desafio, codigo: codigoDe(enviados[1]) } });
  expect(caducado.status).toBe(410);
  const pendientes = await conexion.bd.select().from(verificacionesCorreo);
  expect(pendientes).toHaveLength(1);
});

test('si el proveedor de correo falla responde 502 y no deja desafíos pendientes', async () => {
  await crearUsuario({ nombre: 'Rosa', correo: 'rosa@ejemplo.do' });
  fallarEnvio = true;
  const respuesta = await solicitar('/auth/login', { cuerpo: { identificador: 'rosa@ejemplo.do', contrasena: CLAVE } });
  expect(respuesta.status).toBe(502);
  expect(await conexion.bd.select().from(verificacionesCorreo)).toHaveLength(0);
});

test('cuenta desactivada no inicia sesión y una sesión caducada se rechaza y borra la cookie', async () => {
  await crearUsuario({ nombre: 'Inactivo', usuario: 'inactivo', activo: false });
  expect((await solicitar('/auth/login', { cuerpo: { identificador: 'inactivo', contrasena: CLAVE } })).status).toBe(403);
  expect((await solicitar('/auth/login', { cuerpo: { identificador: 'inactivo', contrasena: 'x' } })).status).toBe(401);

  await crearUsuario({ nombre: 'Activo', usuario: 'activo' });
  const cookie = cookieDe(await solicitar('/auth/login', { cuerpo: { identificador: 'activo', contrasena: CLAVE } }));
  avanzar(13 * 60);
  const caducada = await solicitar('/auth/sesion', { cookie });
  expect(caducada.status).toBe(401);
  expect(caducada.headers.get('set-cookie')).toMatch(/easyway_sesion=;/);
});

test('roles: solo admin crea usuarios; validación, duplicados y JSON obligatorio', async () => {
  await crearUsuario({ nombre: 'Admin', usuario: 'admin', rol: 'admin' });
  await crearUsuario({ nombre: 'Técnico', usuario: 'tecnico' });
  const admin = cookieDe(await solicitar('/auth/login', { cuerpo: { identificador: 'admin', contrasena: CLAVE } }));
  const tecnico = cookieDe(await solicitar('/auth/login', { cuerpo: { identificador: 'tecnico', contrasena: CLAVE } }));
  const nuevo = { nombre: 'Nuevo', correo: 'Nuevo@Ejemplo.do', contrasena: 'otra-clave-segura' };

  expect((await solicitar('/usuarios', { cuerpo: nuevo })).status).toBe(401);
  expect((await solicitar('/usuarios', { cuerpo: nuevo, cookie: tecnico })).status).toBe(403);
  const creado = await solicitar('/usuarios', { cuerpo: nuevo, cookie: admin });
  expect(creado.status).toBe(201);
  const cuerpo = await creado.json();
  expect(cuerpo.usuario).toMatchObject({ correo: 'nuevo@ejemplo.do', rol: 'tecnico' });
  expect(JSON.stringify(cuerpo)).not.toContain('contrasena');
  expect((await solicitar('/usuarios', { cuerpo: nuevo, cookie: admin })).status).toBe(409);
  expect((await solicitar('/usuarios', { cuerpo: { ...nuevo, correo: undefined }, cookie: admin })).status).toBe(400);
  const formulario = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'identificador=admin&contrasena=x',
  });
  expect(formulario.status).toBe(400);
});
