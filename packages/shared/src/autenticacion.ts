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

export const rolesUsuario = ['admin', 'tecnico'] as const;
export type RolUsuario = (typeof rolesUsuario)[number];

export const esquemaCrearUsuario = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  usuario: z.string().trim().toLowerCase().regex(patronUsuario, 'Usuario: 3-40 letras minúsculas, números, punto, guion o guion bajo').optional(),
  correo: z.string().trim().toLowerCase().pipe(z.email('Correo inválido')).optional(),
  contrasena: z.string().min(LONGITUD_MINIMA_CONTRASENA, `La contraseña necesita al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`).max(200),
  rol: z.enum(rolesUsuario).default('tecnico'),
  tecnico_id: z.number().int().positive().optional(),
}).refine(datos => datos.usuario || datos.correo, { message: 'Indica un usuario o un correo', path: ['usuario'] })
  .refine(datos => !datos.tecnico_id || datos.rol === 'tecnico', { message: 'Solo un técnico puede vincularse a la ficha de técnico', path: ['tecnico_id'] });

export interface UsuarioSesion {
  id: number;
  nombre: string;
  usuario: string | null;
  correo: string | null;
  rol: RolUsuario;
  tecnico_id: number | null;
}

export type RespuestaLogin =
  | { estado: 'sesion_iniciada'; usuario: UsuarioSesion }
  | { estado: 'verificacion_requerida'; desafio: string; correo: string; reintentarEn: number };
