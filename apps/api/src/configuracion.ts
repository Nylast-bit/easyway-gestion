import { esquemaConexion } from '@easyway/shared';

// Validación reutilizable por el futuro servidor Hono; no abre conexiones al importar.
export function validarConfiguracion(entorno: Record<string, string | undefined>) {
  const resultado = esquemaConexion.safeParse(entorno);
  if (!resultado.success) throw new Error('DATABASE_URL ausente o inválida');
  return resultado.data;
}
