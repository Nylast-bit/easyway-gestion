import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { esquemaVehiculo, type VehiculoFila } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, gps, gpsAsignaciones, vehiculoImagenes, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import type { AlmacenArchivos } from '../almacen/almacen';
import { asignarGpsAVehiculo } from './asignaciones';
import { SEGUNDOS_URL_TEMPORAL } from './fotos';

export function crearRutasVehiculos(bd: BaseDatos, reloj: () => Date, almacen: AlmacenArchivos) {
  async function listar(filtro?: { id?: number; cliente_id?: number }): Promise<VehiculoFila[]> {
    const condicion = filtro?.id ? eq(vehiculos.id, filtro.id) : filtro?.cliente_id ? eq(vehiculos.cliente_id, filtro.cliente_id) : undefined;
    const filas = await bd.select({ vehiculo: vehiculos, cliente_nombre: clientes.nombre }).from(vehiculos)
      .innerJoin(clientes, eq(clientes.id, vehiculos.cliente_id)).where(condicion).orderBy(desc(vehiculos.created_at));
    if (!filas.length) return [];
    const ids = filas.map(f => f.vehiculo.id);
    const [activos, fotos] = await Promise.all([
      bd.select({ vehiculo_id: gpsAsignaciones.vehiculo_id, id: gps.id, imei: gps.imei, modelo: gps.modelo })
        .from(gpsAsignaciones).innerJoin(gps, eq(gps.id, gpsAsignaciones.gps_id))
        .where(and(inArray(gpsAsignaciones.vehiculo_id, ids), isNull(gpsAsignaciones.fecha_fin))),
      bd.select({ vehiculo_id: vehiculoImagenes.vehiculo_id, storage_path: vehiculoImagenes.storage_path }).from(vehiculoImagenes)
        .where(inArray(vehiculoImagenes.vehiculo_id, ids)).orderBy(asc(vehiculoImagenes.id)),
    ]);
    // Miniatura: primera foto de cada vehículo, firmada en un solo lote.
    const primeras = new Map<number, string>();
    for (const foto of fotos) if (!primeras.has(foto.vehiculo_id)) primeras.set(foto.vehiculo_id, foto.storage_path);
    const urls = await almacen.urlsTemporales([...primeras.values()], SEGUNDOS_URL_TEMPORAL)
      .catch(error => { console.error('No se pudieron firmar miniaturas:', (error as Error).message); return new Map<string, string>(); });
    return filas.map(({ vehiculo, cliente_nombre }) => {
      const activo = activos.find(a => a.vehiculo_id === vehiculo.id);
      const primera = primeras.get(vehiculo.id);
      return {
        ...vehiculo, cliente_nombre, created_at: vehiculo.created_at.toISOString(),
        gps: activo ? { id: activo.id, imei: activo.imei, modelo: activo.modelo } : null,
        imagenes: fotos.filter(f => f.vehiculo_id === vehiculo.id).length,
        miniatura: primera ? urls.get(primera) ?? null : null,
      };
    });
  }

  async function uno(id: number) {
    const [fila] = await listar({ id });
    if (!fila) throw new ErrorHttp(404, 'Vehículo no encontrado');
    return fila;
  }

  return new Hono<Entorno>()
    .get('/', async c => {
      const cliente = Number(c.req.query('cliente_id'));
      return c.json(await listar(Number.isInteger(cliente) && cliente > 0 ? { cliente_id: cliente } : undefined));
    })
    .get('/:id', async c => c.json(await uno(leerId(c))))
    .post('/', async c => {
      const { gps_id, ...datos } = await leerJson(c, esquemaVehiculo);
      const id = await bd.transaction(async tx => {
        const [fila] = await tx.insert(vehiculos).values(datos).returning({ id: vehiculos.id });
        if (gps_id) await asignarGpsAVehiculo(tx, fila.id, gps_id, reloj());
        return fila.id;
      });
      return c.json(await uno(id), 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const { gps_id, ...datos } = await leerJson(c, esquemaVehiculo);
      await bd.transaction(async tx => {
        const [fila] = await tx.update(vehiculos).set(datos).where(eq(vehiculos.id, id)).returning({ id: vehiculos.id });
        if (!fila) throw new ErrorHttp(404, 'Vehículo no encontrado');
        // Solo se toca la asignación si el cliente envió el campo gps_id.
        if (gps_id !== undefined) await asignarGpsAVehiculo(tx, id, gps_id, reloj());
      });
      return c.json(await uno(id));
    })
    .delete('/:id', async c => {
      const id = leerId(c);
      // Las fotos no son historial: se borran con el vehículo. Si hay instalaciones o
      // asignaciones de GPS, la clave foránea revierte todo (409) y las fotos se conservan.
      const rutas = await bd.transaction(async tx => {
        const fotos = await tx.delete(vehiculoImagenes).where(eq(vehiculoImagenes.vehiculo_id, id)).returning({ ruta: vehiculoImagenes.storage_path });
        const [fila] = await tx.delete(vehiculos).where(eq(vehiculos.id, id)).returning({ id: vehiculos.id });
        if (!fila) throw new ErrorHttp(404, 'Vehículo no encontrado');
        return fotos.map(f => f.ruta);
      });
      // Tras confirmar en BD: un fallo aquí solo deja archivos huérfanos, nunca registros rotos.
      await almacen.borrar(rutas).catch(error => console.error('Fotos huérfanas tras borrar vehículo:', (error as Error).message));
      return c.body(null, 204);
    });
}
