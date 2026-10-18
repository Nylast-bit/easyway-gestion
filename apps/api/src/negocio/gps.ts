import { Hono } from 'hono';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { esquemaGps, estadosGps, type EstadoGps, type GpsFila } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { gps, gpsAsignaciones, simcardAsignaciones, simcards, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import { asignarSimcardAGps, cerrarAsignacionVehiculoDeGps } from './asignaciones';

export function crearRutasGps(bd: BaseDatos, reloj: () => Date) {
  async function listar(filtro?: { id?: number; estado?: EstadoGps }): Promise<GpsFila[]> {
    const condicion = filtro?.id ? eq(gps.id, filtro.id) : filtro?.estado ? eq(gps.estado, filtro.estado) : undefined;
    const filas = await bd.select().from(gps).where(condicion).orderBy(desc(gps.created_at));
    if (!filas.length) return [];
    const ids = filas.map(f => f.id);
    const [sims, vehs] = await Promise.all([
      bd.select({ gps_id: simcardAsignaciones.gps_id, id: simcards.id, numero: simcards.numero }).from(simcardAsignaciones)
        .innerJoin(simcards, eq(simcards.id, simcardAsignaciones.simcard_id))
        .where(and(inArray(simcardAsignaciones.gps_id, ids), isNull(simcardAsignaciones.fecha_fin))),
      bd.select({ gps_id: gpsAsignaciones.gps_id, id: vehiculos.id, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa })
        .from(gpsAsignaciones).innerJoin(vehiculos, eq(vehiculos.id, gpsAsignaciones.vehiculo_id))
        .where(and(inArray(gpsAsignaciones.gps_id, ids), isNull(gpsAsignaciones.fecha_fin))),
    ]);
    return filas.map(fila => {
      const sim = sims.find(s => s.gps_id === fila.id);
      const veh = vehs.find(v => v.gps_id === fila.id);
      return {
        ...fila, created_at: fila.created_at.toISOString(),
        simcard: sim ? { id: sim.id, numero: sim.numero } : null,
        vehiculo: veh ? { id: veh.id, marca: veh.marca, modelo: veh.modelo, placa: veh.placa } : null,
      };
    });
  }

  async function uno(id: number) {
    const [fila] = await listar({ id });
    if (!fila) throw new ErrorHttp(404, 'GPS no encontrado');
    return fila;
  }

  return new Hono<Entorno>()
    .get('/', async c => {
      const estado = c.req.query('estado');
      if (estado && !(estadosGps as readonly string[]).includes(estado)) throw new ErrorHttp(400, 'Estado de GPS inválido');
      return c.json(await listar(estado ? { estado: estado as EstadoGps } : undefined));
    })
    .get('/:id', async c => c.json(await uno(leerId(c))))
    .post('/', async c => {
      const { simcard_id, ...datos } = await leerJson(c, esquemaGps);
      const id = await bd.transaction(async tx => {
        const [fila] = await tx.insert(gps).values(datos).returning({ id: gps.id });
        if (simcard_id) await asignarSimcardAGps(tx, fila.id, simcard_id, reloj());
        return fila.id;
      });
      return c.json(await uno(id), 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const { simcard_id, ...datos } = await leerJson(c, esquemaGps);
      await bd.transaction(async tx => {
        const ahora = reloj();
        const [fila] = await tx.update(gps).set(datos).where(eq(gps.id, id)).returning({ id: gps.id });
        if (!fila) throw new ErrorHttp(404, 'GPS no encontrado');
        // Un GPS que deja de estar "Instalado" se retira del vehículo (conserva el historial).
        if (datos.estado !== 'Instalado') await cerrarAsignacionVehiculoDeGps(tx, id, ahora);
        if (simcard_id !== undefined) await asignarSimcardAGps(tx, id, simcard_id, ahora);
      });
      return c.json(await uno(id));
    })
    .delete('/:id', async c => {
      const [fila] = await bd.delete(gps).where(eq(gps.id, leerId(c))).returning({ id: gps.id });
      if (!fila) throw new ErrorHttp(404, 'GPS no encontrado');
      return c.body(null, 204);
    });
}
