import { Hono } from 'hono';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { AuditoriaFila, UsuarioSesion } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { auditoria, usuarios } from '../db/esquema';
import type { Entorno } from '../auth/middleware';

// Se llama dentro de la misma transacción que la acción: si la acción se revierte, su registro también.
export async function registrarAuditoria(
  ejecutor: Pick<BaseDatos, 'insert'>, usuario: Pick<UsuarioSesion, 'id'> | null,
  accion: string, entidad: string, entidadId: number | null, detalle?: Record<string, unknown>,
) {
  await ejecutor.insert(auditoria).values({ usuario_id: usuario?.id ?? null, accion, entidad, entidad_id: entidadId, detalle: detalle ?? null });
}

export function crearRutasAuditoria(bd: BaseDatos) {
  return new Hono<Entorno>().get('/', async c => {
    const filtros: SQL[] = [];
    const entidad = c.req.query('entidad');
    const entidadId = Number(c.req.query('entidad_id'));
    if (entidad) filtros.push(eq(auditoria.entidad, entidad));
    if (Number.isInteger(entidadId) && entidadId > 0) filtros.push(eq(auditoria.entidad_id, entidadId));
    const limite = Math.min(Math.max(Number(c.req.query('limite')) || 100, 1), 500);
    const filas = await bd.select({ fila: auditoria, usuario_nombre: usuarios.nombre }).from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.usuario_id))
      .where(and(...filtros)).orderBy(desc(auditoria.id)).limit(limite);
    const resultado: AuditoriaFila[] = filas.map(({ fila, usuario_nombre }) => ({
      id: fila.id, usuario_nombre, accion: fila.accion, entidad: fila.entidad, entidad_id: fila.entidad_id,
      detalle: fila.detalle, created_at: fila.created_at.toISOString(),
    }));
    return c.json(resultado);
  });
}
