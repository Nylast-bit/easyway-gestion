import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { esquemaInstalacion, type DatosInstalacion, type InstalacionFila } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, gps, instalaciones, simcards, tecnicos, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';

// Registro de trabajos de campo. Las asignaciones automáticas al aprobar
// una instalación llegan con el flujo de técnicos/aprobación (fase 7).
export function crearRutasInstalaciones(bd: BaseDatos) {
  async function listar(id?: number): Promise<InstalacionFila[]> {
    const filas = await bd.select({
      instalacion: instalaciones,
      marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa,
      cliente_id: clientes.id, cliente_nombre: clientes.nombre,
      gps_imei: gps.imei, simcard_numero: simcards.numero, tecnico_nombre: tecnicos.nombre,
    }).from(instalaciones)
      .innerJoin(vehiculos, eq(vehiculos.id, instalaciones.vehiculo_id))
      .innerJoin(clientes, eq(clientes.id, vehiculos.cliente_id))
      .innerJoin(gps, eq(gps.id, instalaciones.gps_id))
      .leftJoin(simcards, eq(simcards.id, instalaciones.simcard_id))
      .leftJoin(tecnicos, eq(tecnicos.id, instalaciones.tecnico_id))
      .where(id ? eq(instalaciones.id, id) : undefined)
      .orderBy(sql`${instalaciones.fecha_instalacion} DESC NULLS LAST`, desc(instalaciones.created_at));
    return filas.map(({ instalacion, marca, modelo, placa, cliente_id, cliente_nombre, ...nombres }) => ({
      ...instalacion,
      fecha_instalacion: instalacion.fecha_instalacion?.toISOString() ?? null,
      created_at: instalacion.created_at.toISOString(),
      vehiculo: { marca, modelo, placa, cliente_id, cliente_nombre },
      ...nombres,
    }));
  }

  async function uno(id: number) {
    const [fila] = await listar(id);
    if (!fila) throw new ErrorHttp(404, 'Instalación no encontrada');
    return fila;
  }

  const aFila = (d: DatosInstalacion) => ({ ...d, fecha_instalacion: d.fecha_instalacion ? new Date(d.fecha_instalacion) : null });

  return new Hono<Entorno>()
    .get('/', async c => c.json(await listar()))
    .get('/:id', async c => c.json(await uno(leerId(c))))
    .post('/', async c => {
      const [fila] = await bd.insert(instalaciones).values(aFila(await leerJson(c, esquemaInstalacion))).returning({ id: instalaciones.id });
      return c.json(await uno(fila.id), 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const [fila] = await bd.update(instalaciones).set(aFila(await leerJson(c, esquemaInstalacion)))
        .where(eq(instalaciones.id, id)).returning({ id: instalaciones.id });
      if (!fila) throw new ErrorHttp(404, 'Instalación no encontrada');
      return c.json(await uno(id));
    })
    .delete('/:id', async c => {
      const [fila] = await bd.delete(instalaciones).where(eq(instalaciones.id, leerId(c))).returning({ id: instalaciones.id });
      if (!fila) throw new ErrorHttp(404, 'Instalación no encontrada');
      return c.body(null, 204);
    });
}
