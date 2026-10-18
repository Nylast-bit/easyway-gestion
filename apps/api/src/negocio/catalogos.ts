import { Hono } from 'hono';
import { and, asc, count, eq } from 'drizzle-orm';
import { esquemaPlan, esquemaTipoServicio, type PlanFila, type TipoServicioFila } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { planes, servicios, tiposServicio } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import { exigirAdmin } from './acceso';
import { registrarAuditoria } from './auditoria';

// Tipos de servicio: lectura para cualquier sesión (los técnicos los eligen en campo); escritura solo admin.
export function crearRutasTiposServicio(bd: BaseDatos) {
  const uno = async (id: number) => {
    const [fila] = await bd.select({ id: tiposServicio.id, nombre: tiposServicio.nombre, activo: tiposServicio.activo })
      .from(tiposServicio).where(eq(tiposServicio.id, id));
    if (!fila) throw new ErrorHttp(404, 'Tipo de servicio no encontrado');
    return fila satisfies TipoServicioFila;
  };
  return new Hono<Entorno>()
    .get('/', async c => {
      const soloActivos = c.req.query('activos') === '1';
      const filas = await bd.select({ id: tiposServicio.id, nombre: tiposServicio.nombre, activo: tiposServicio.activo })
        .from(tiposServicio).where(soloActivos ? eq(tiposServicio.activo, true) : undefined).orderBy(asc(tiposServicio.id));
      return c.json(filas satisfies TipoServicioFila[]);
    })
    .post('/', async c => {
      exigirAdmin(c.get('usuario'));
      const datos = await leerJson(c, esquemaTipoServicio);
      const id = await bd.transaction(async tx => {
        const [fila] = await tx.insert(tiposServicio).values(datos).returning({ id: tiposServicio.id });
        await registrarAuditoria(tx, c.get('usuario'), 'crear', 'tipo_servicio', fila.id, datos);
        return fila.id;
      });
      return c.json(await uno(id), 201);
    })
    .put('/:id', async c => {
      exigirAdmin(c.get('usuario'));
      const id = leerId(c);
      const datos = await leerJson(c, esquemaTipoServicio);
      await bd.transaction(async tx => {
        const [fila] = await tx.update(tiposServicio).set(datos).where(eq(tiposServicio.id, id)).returning({ id: tiposServicio.id });
        if (!fila) throw new ErrorHttp(404, 'Tipo de servicio no encontrado');
        await registrarAuditoria(tx, c.get('usuario'), 'actualizar', 'tipo_servicio', id, datos);
      });
      return c.json(await uno(id));
    });
}

// Planes: se desactivan en lugar de borrarse; los servicios contratados conservan su precio pactado.
export function crearRutasPlanes(bd: BaseDatos) {
  async function listar(id?: number): Promise<PlanFila[]> {
    const filas = await bd.select({ plan: planes, servicios_activos: count(servicios.id) }).from(planes)
      .leftJoin(servicios, and(eq(servicios.plan_id, planes.id), eq(servicios.estado, 'Activo')))
      .where(id ? eq(planes.id, id) : undefined).groupBy(planes.id).orderBy(asc(planes.nombre));
    return filas.map(({ plan, servicios_activos }) => ({
      id: plan.id, nombre: plan.nombre, periodicidad: plan.periodicidad, precio: plan.precio, activo: plan.activo, servicios_activos,
    }));
  }
  const uno = async (id: number) => {
    const [fila] = await listar(id);
    if (!fila) throw new ErrorHttp(404, 'Plan no encontrado');
    return fila;
  };
  return new Hono<Entorno>()
    .get('/', async c => c.json(await listar()))
    .post('/', async c => {
      const datos = await leerJson(c, esquemaPlan);
      const id = await bd.transaction(async tx => {
        const [fila] = await tx.insert(planes).values(datos).returning({ id: planes.id });
        await registrarAuditoria(tx, c.get('usuario'), 'crear', 'plan', fila.id, datos);
        return fila.id;
      });
      return c.json(await uno(id), 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const datos = await leerJson(c, esquemaPlan);
      await bd.transaction(async tx => {
        const [anterior] = await tx.select().from(planes).where(eq(planes.id, id)).for('update');
        if (!anterior) throw new ErrorHttp(404, 'Plan no encontrado');
        await tx.update(planes).set(datos).where(eq(planes.id, id));
        await registrarAuditoria(tx, c.get('usuario'), 'actualizar', 'plan', id, {
          antes: { nombre: anterior.nombre, precio: anterior.precio, periodicidad: anterior.periodicidad, activo: anterior.activo }, despues: datos,
        });
      });
      return c.json(await uno(id));
    });
}
