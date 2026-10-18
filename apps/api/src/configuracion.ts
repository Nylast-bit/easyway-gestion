import { z } from 'zod';
import { esquemaConexion } from '@easyway/shared';

// Validación reutilizable por el servidor Hono; no abre conexiones al importar.
export function validarConfiguracion(entorno: Record<string, string | undefined>) {
  const resultado = esquemaConexion.safeParse(entorno);
  if (!resultado.success) throw new Error('DATABASE_URL ausente o inválida');
  return resultado.data;
}

const esquemaServidor = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PUERTO: z.coerce.number().int().min(1).max(65535).default(3001),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  CORREO_REMITENTE: z.string().trim().min(3).optional(),
});

export type ConfiguracionServidor = ReturnType<typeof validarConfiguracionServidor>;

// Los mensajes nombran variables, nunca sus valores, para no filtrar credenciales en registros.
export function validarConfiguracionServidor(entorno: Record<string, string | undefined>) {
  const { DATABASE_URL } = validarConfiguracion(entorno);
  const vacio = (valor?: string) => (valor?.trim() ? valor : undefined);
  const resultado = esquemaServidor.safeParse({
    NODE_ENV: vacio(entorno.NODE_ENV), API_PUERTO: vacio(entorno.API_PUERTO),
    RESEND_API_KEY: vacio(entorno.RESEND_API_KEY), CORREO_REMITENTE: vacio(entorno.CORREO_REMITENTE),
  });
  if (!resultado.success) throw new Error(`Configuración inválida: ${resultado.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const datos = resultado.data;
  if (Boolean(datos.RESEND_API_KEY) !== Boolean(datos.CORREO_REMITENTE)) {
    throw new Error('RESEND_API_KEY y CORREO_REMITENTE deben configurarse juntas');
  }
  const produccion = datos.NODE_ENV === 'production';
  if (produccion && !datos.RESEND_API_KEY) throw new Error('En producción se requieren RESEND_API_KEY y CORREO_REMITENTE');
  return { DATABASE_URL, puerto: datos.API_PUERTO, produccion, resend: datos.RESEND_API_KEY
    ? { apiKey: datos.RESEND_API_KEY, remitente: datos.CORREO_REMITENTE! } : null };
}
