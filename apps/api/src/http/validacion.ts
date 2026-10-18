import type { Context } from 'hono';
import type { z } from 'zod';

export class ErrorHttp extends Error {
  constructor(public estado: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 423 | 429 | 502, mensaje: string, public detalles?: unknown) {
    super(mensaje);
  }
}

// Solo JSON: un formulario de otro sitio no puede enviar este tipo sin preflight CORS (defensa CSRF junto a SameSite).
export async function leerJson<T extends z.ZodType>(c: Context, esquema: T): Promise<z.infer<T>> {
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ErrorHttp(400, 'Se esperaba un cuerpo JSON');
  }
  let cuerpo: unknown;
  try { cuerpo = await c.req.json(); } catch { throw new ErrorHttp(400, 'JSON inválido'); }
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) {
    const errores = resultado.error.issues.map(i => ({ campo: i.path.join('.'), mensaje: i.message }));
    throw new ErrorHttp(400, errores[0]?.mensaje ?? 'Datos inválidos', errores);
  }
  return resultado.data;
}
