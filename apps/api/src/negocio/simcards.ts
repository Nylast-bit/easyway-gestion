import { Hono } from 'hono';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { esquemaSimcard, estadosSimcard, type AsignacionHistorial, type EstadoSimcard, type SimcardFila } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { gps, simcardAsignaciones, simcards } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';

export function crearRutasSimcards(bd: BaseDatos) {
  async function listar(filtro?: { id?: number; estado?: EstadoSimcard }): Promise<SimcardFila[]> {
    const condicion = filtro?.id ? eq(simcards.id, filtro.id) : filtro?.estado ? eq(simcards.estado, filtro.estado) : undefined;
    const filas = await bd.select().from(simcards).where(condicion).orderBy(desc(simcards.created_at));
    if (!filas.length) return [];
    const activas = await bd.select({ simcard_id: simcardAsignaciones.simcard_id, id: gps.id, imei: gps.imei }).from(simcardAsignaciones)
      .innerJoin(gps, eq(gps.id, simcardAsignaciones.gps_id))
      .where(and(inArray(simcardAsignaciones.simcard_id, filas.map(f => f.id)), isNull(simcardAsignaciones.fecha_fin)));
    return filas.map(fila => {
      const activa = activas.find(a => a.simcard_id === fila.id);
      return { ...fila, created_at: fila.created_at.toISOString(), gps: activa ? { id: activa.id, imei: activa.imei } : null };
    });
  }

  async function uno(id: number) {
    const [fila] = await listar({ id });
    if (!fila) throw new ErrorHttp(404, 'Simcard no encontrada');
    return fila;
  }

  return new Hono<Entorno>()
    .get('/', async c => {
      const estado = c.req.query('estado');
      if (estado && !(estadosSimcard as readonly string[]).includes(estado)) throw new ErrorHttp(400, 'Estado de simcard inválido');
      return c.json(await listar(estado ? { estado: estado as EstadoSimcard } : undefined));
    })
    .get('/:id/historial', async c => {
      const id = leerId(c);
      const filas = await bd.select({ fecha_inicio: simcardAsignaciones.fecha_inicio, fecha_fin: simcardAsignaciones.fecha_fin, id: gps.id, imei: gps.imei, modelo: gps.modelo })
        .from(simcardAsignaciones).innerJoin(gps, eq(gps.id, simcardAsignaciones.gps_id))
        .where(eq(simcardAsignaciones.simcard_id, id)).orderBy(desc(simcardAsignaciones.fecha_inicio));
      const historial: AsignacionHistorial[] = filas.map(f => ({
        fecha_inicio: f.fecha_inicio.toISOString(), fecha_fin: f.fecha_fin?.toISOString() ?? null,
        gps: { id: f.id, imei: f.imei, modelo: f.modelo },
      }));
      return c.json(historial);
    })
    .get('/:id', async c => c.json(await uno(leerId(c))))
    // El estado no se edita aquí: lo gobiernan las asignaciones a GPS.
    .post('/', async c => {
      const [fila] = await bd.insert(simcards).values(await leerJson(c, esquemaSimcard)).returning({ id: simcards.id });
      return c.json(await uno(fila.id), 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const [fila] = await bd.update(simcards).set(await leerJson(c, esquemaSimcard)).where(eq(simcards.id, id)).returning({ id: simcards.id });
      if (!fila) throw new ErrorHttp(404, 'Simcard no encontrada');
      return c.json(await uno(id));
    })
    .delete('/:id', async c => {
      const [fila] = await bd.delete(simcards).where(eq(simcards.id, leerId(c))).returning({ id: simcards.id });
      if (!fila) throw new ErrorHttp(404, 'Simcard no encontrada');
      return c.body(null, 204);
    });
}
