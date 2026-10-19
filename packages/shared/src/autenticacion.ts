import { z } from 'zod';

// Contratos compartidos entre la API Hono y la web. Mensajes en español para mostrarse tal cual.
export const LONGITUD_CODIGO_OTP = 6;
export const LONGITUD_MINIMA_CONTRASENA = 10;
export const patronUsuario = /^[a-z0-9._-]{3,40}$/;

export type Identificador = { tipo: 'correo'; valor: string } | { tipo: 'usuario'; valor: string };

// Con "@" se trata como correo (requiere verificación OTP); en otro caso es nombre de usuario.
export function clasificarIdentificador(valor: string): Identificador | null {
  const limpio = valor.trim().toLowerCase();
  if (limpio.includes('@')) return z.email().safeParse(limpio).success ? { tipo: 'correo', valor: limpio } : null;
  return patronUsuario.test(limpio) ? { tipo: 'usuario', valor: limpio } : null;
}

const contrasena = z.string().min(1, 'Introduce la contraseña').max(200, 'Contraseña demasiado larga');

export const esquemaLogin = z.object({
  identificador: z.string().trim().min(1, 'Introduce tu usuario o correo').max(254)
    .refine(valor => clasificarIdentificador(valor) !== null, 'Usuario o correo con formato inválido'),
  contrasena,
});

export const esquemaVerificarCorreo = z.object({
  desafio: z.string().min(20).max(200),
  codigo: z.string().trim().regex(new RegExp(`^\\d{${LONGITUD_CODIGO_OTP}}$`), `El código tiene ${LONGITUD_CODIGO_OTP} dígitos`),
});

export const esquemaReenviarCodigo = z.object({ desafio: z.string().min(20).max(200) });

const contrasenaNueva = z.string().min(LONGITUD_MINIMA_CONTRASENA, `La contraseña necesita al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`).max(200);

/** Cédula dominicana: solo los 11 dígitos (acepta 001-1234567-8 o 00112345678). */
export const normalizarCedula = (valor: string) => valor.replace(/\D/g, '');
export const formatearCedula = (cedula: string) => `${cedula.slice(0, 3)}-${cedula.slice(3, 10)}-${cedula.slice(10)}`;
export const esquemaCedula = z.string().transform(normalizarCedula).pipe(z.string().regex(/^\d{11}$/, 'La cédula tiene 11 dígitos'));

// Recuperación de acceso: por código al correo, o por cédula para cuentas sin correo.
export const esquemaRecuperarPorCorreo = z.object({
  correo: z.string().trim().toLowerCase().pipe(z.email('Correo inválido')),
});
export const esquemaConfirmarRecuperacion = z.object({
  desafio: z.string().min(20).max(200),
  codigo: esquemaVerificarCorreo.shape.codigo,
  contrasena: contrasenaNueva,
});
export const esquemaRecuperarPorCedula = z.object({
  usuario: z.string().trim().toLowerCase().regex(patronUsuario, 'Usuario con formato inválido'),
  cedula: esquemaCedula,
});
export const esquemaCambiarContrasena = z.object({ actual: contrasena, nueva: contrasenaNueva })
  .refine(datos => datos.actual !== datos.nueva, { message: 'La contraseña nueva debe ser distinta de la actual', path: ['nueva'] });

export interface RespuestaRecuperacion { desafio: string; correo: string; reintentarEn: number }
export interface RespuestaRecuperacionCedula { contrasena_temporal: string }

export const rolesUsuario = ['admin', 'tecnico'] as const;
export type RolUsuario = (typeof rolesUsuario)[number];

// Los formularios envían "" en campos vacíos: equivale a no indicarlo.
const vacioComoAusente = (valor: unknown) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor);

export const esquemaCrearUsuario = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  usuario: z.preprocess(vacioComoAusente, z.string().trim().toLowerCase().regex(patronUsuario, 'Usuario: 3-40 letras minúsculas, números, punto, guion o guion bajo').optional()),
  correo: z.preprocess(vacioComoAusente, z.string().trim().toLowerCase().pipe(z.email('Correo inválido')).optional()),
  contrasena: z.string().min(LONGITUD_MINIMA_CONTRASENA, `La contraseña necesita al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`).max(200),
  rol: z.enum(rolesUsuario).default('tecnico'),
  tecnico_id: z.preprocess(vacioComoAusente, z.coerce.number().int().positive().nullable().optional()),
  cedula: z.preprocess(vacioComoAusente, esquemaCedula.nullable().optional()),
}).refine(datos => datos.usuario || datos.correo, { message: 'Indica un usuario o un correo', path: ['usuario'] })
  .refine(datos => !datos.tecnico_id || datos.rol === 'tecnico', { message: 'Solo un técnico puede vincularse a la ficha de técnico', path: ['tecnico_id'] });

export interface UsuarioSesion {
  id: number;
  nombre: string;
  usuario: string | null;
  correo: string | null;
  rol: RolUsuario;
  tecnico_id: number | null;
  // Contraseña temporal o puesta por un admin: el portal solo permite cambiarla.
  debe_cambiar_contrasena?: boolean;
}

export type RespuestaLogin =
  | { estado: 'sesion_iniciada'; usuario: UsuarioSesion }
  | { estado: 'verificacion_requerida'; desafio: string; correo: string; reintentarEn: number };

// Gestión de cuentas por un administrador. Usuario y correo no se editan: son identificadores de acceso.
export const esquemaActualizarUsuario = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  rol: z.enum(rolesUsuario),
  tecnico_id: z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional()
    .transform(valor => (valor === '' || valor === undefined ? null : valor)),
  cedula: z.preprocess(vacioComoAusente, esquemaCedula.nullable().optional()).transform(valor => valor ?? null),
  activo: z.boolean(),
}).refine(datos => !datos.tecnico_id || datos.rol === 'tecnico', { message: 'Solo un técnico puede vincularse a la ficha de técnico', path: ['tecnico_id'] });

export const esquemaRestablecerContrasena = z.object({
  contrasena: z.string().min(LONGITUD_MINIMA_CONTRASENA, `La contraseña necesita al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`).max(200),
});

export interface UsuarioFila extends UsuarioSesion {
  activo: boolean;
  correo_verificado: boolean;
  bloqueado_hasta: string | null;
  tecnico_nombre: string | null;
  cedula: string | null;
  created_at: string;
}
