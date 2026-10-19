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
  // En local solo 127.0.0.1; en Render y similares 0.0.0.0 para recibir tráfico del balanceador.
  API_HOST: z.union([z.literal('127.0.0.1'), z.literal('0.0.0.0'), z.literal('::')]).default('127.0.0.1'),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  CORREO_REMITENTE: z.string().trim().min(3).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SECRET_KEY: z.string().trim().min(20).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().trim().regex(/^[a-z0-9_-]{3,63}$/).default('vehicles'),
});

export type ConfiguracionServidor = ReturnType<typeof validarConfiguracionServidor>;

// Los mensajes nombran variables, nunca sus valores, para no filtrar credenciales en registros.
export function validarConfiguracionServidor(entorno: Record<string, string | undefined>) {
  const { DATABASE_URL } = validarConfiguracion(entorno);
  const vacio = (valor?: string) => (valor?.trim() ? valor : undefined);
  const resultado = esquemaServidor.safeParse({
    // Render (y otros PaaS) asignan el puerto en PORT; API_PUERTO tiene prioridad si se define.
    NODE_ENV: vacio(entorno.NODE_ENV), API_PUERTO: vacio(entorno.API_PUERTO) ?? vacio(entorno.PORT), API_HOST: vacio(entorno.API_HOST),
    RESEND_API_KEY: vacio(entorno.RESEND_API_KEY), CORREO_REMITENTE: vacio(entorno.CORREO_REMITENTE),
    SUPABASE_URL: vacio(entorno.SUPABASE_URL), SUPABASE_SECRET_KEY: vacio(entorno.SUPABASE_SECRET_KEY),
    SUPABASE_STORAGE_BUCKET: vacio(entorno.SUPABASE_STORAGE_BUCKET),
  });
  if (!resultado.success) throw new Error(`Configuración inválida: ${resultado.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const datos = resultado.data;
  if (Boolean(datos.RESEND_API_KEY) !== Boolean(datos.CORREO_REMITENTE)) {
    throw new Error('RESEND_API_KEY y CORREO_REMITENTE deben configurarse juntas');
  }
  const produccion = datos.NODE_ENV === 'production';
  if (produccion && !datos.RESEND_API_KEY) throw new Error('En producción se requieren RESEND_API_KEY y CORREO_REMITENTE');
  if (Boolean(datos.SUPABASE_URL) !== Boolean(datos.SUPABASE_SECRET_KEY)) {
    throw new Error('SUPABASE_URL y SUPABASE_SECRET_KEY deben configurarse juntas');
  }
  // Una clave publicable no puede firmar ni subir en un bucket privado: se detecta antes de arrancar.
  if (datos.SUPABASE_SECRET_KEY?.startsWith('sb_publishable_')) throw new Error('SUPABASE_SECRET_KEY debe ser una clave secreta, no publicable');
  if (produccion && !datos.SUPABASE_URL) throw new Error('En producción se requieren SUPABASE_URL y SUPABASE_SECRET_KEY');
  return {
    DATABASE_URL, puerto: datos.API_PUERTO, host: datos.API_HOST, produccion,
    resend: datos.RESEND_API_KEY ? { apiKey: datos.RESEND_API_KEY, remitente: datos.CORREO_REMITENTE! } : null,
    storage: datos.SUPABASE_URL
      ? { url: datos.SUPABASE_URL, claveSecreta: datos.SUPABASE_SECRET_KEY!, bucket: datos.SUPABASE_STORAGE_BUCKET } : null,
  };
}
