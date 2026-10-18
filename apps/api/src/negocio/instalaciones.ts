import { Hono } from 'hono';
import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import {
  esquemaAvanceInstalacion, esquemaFiltroInstalaciones, esquemaInstalacion,
  type DatosInstalacion, type InstalacionFila, type ResumenInstalaciones, type UsuarioSesion,
} from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, gps, instalaciones, simcards, tecnicos, tiposServicio, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import { exigirAdmin, fichaTecnico } from './acceso';

// Registro de trabajos de campo. El admin gestiona todo; un técnico ve solo sus
// instalaciones y únicamente actualiza su avance. Las asignaciones automáticas al
// aprobar una instalación llegan con el flujo de aprobación (fase 7).
export function crearRutasInstalaciones(bd: BaseDatos) {
  async function listar(filtros: SQL[] = []): Promise<InstalacionFila[]> {
    const filas = await bd.select({
      instalacion: instalaciones,
      marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa,
      cliente_id: clientes.id, cliente_nombre: clientes.nombre,
      gps_imei: gps.imei, simcard_numero: simcards.numero, tecnico_nombre: tecnicos.nombre, tipo: tiposServicio.nombre,
    }).from(instalaciones)
      .innerJoin(tiposServicio, eq(tiposServicio.id, instalaciones.tipo_servicio_id))
      .innerJoin(vehiculos, eq(vehiculos.id, instalaciones.vehiculo_id))
      .innerJoin(clientes, eq(clientes.id, vehiculos.cliente_id))
      .innerJoin(gps, eq(gps.id, instalaciones.gps_id))
      .leftJoin(simcards, eq(simcards.id, instalaciones.simcard_id))
      .leftJoin(tecnicos, eq(tecnicos.id, instalaciones.tecnico_id))
      // Los trabajos pendientes de aprobación (fase 7) se consultan en su propia cola.
      .where(and(eq(instalaciones.aprobacion, 'Aprobada'), ...filtros))
      .orderBy(sql`${instalaciones.fecha_instalacion} DESC NULLS LAST`, desc(instalaciones.created_at));
    return filas.map(({ instalacion, marca, modelo, placa, cliente_id, cliente_nombre, ...nombres }) => ({
      ...instalacion, vehiculo_id: instalacion.vehiculo_id!, gps_id: instalacion.gps_id!,
      costo_pagado_at: instalacion.costo_pagado_at?.toISOString() ?? null,
      fecha_instalacion: instalacion.fecha_instalacion?.toISOString() ?? null,
      created_at: instalacion.created_at.toISOString(),
      vehiculo: { marca, modelo, placa, cliente_id, cliente_nombre },
      ...nombres,
    }));
  }

  // Filtro de aislamiento: para un técnico, solo filas con su tecnico_id.
  const alcance = (tecnico: number | null) => (tecnico === null ? [] : [eq(instalaciones.tecnico_id, tecnico)]);

  async function uno(id: number, tecnico: number | null = null) {
    const [fila] = await listar([eq(instalaciones.id, id), ...alcance(tecnico)]);
    if (!fila) throw new ErrorHttp(404, 'Instalación no encontrada');
    return fila;
  }

  // Filtros del listado; para un técnico el filtro de técnico se ignora (siempre ve solo lo suyo).
  function filtrosDe(consulta: Record<string, string>, usuario: UsuarioSesion): SQL[] {
    const resultado = esquemaFiltroInstalaciones.safeParse(consulta);
    if (!resultado.success) throw new ErrorHttp(400, resultado.error.issues[0]?.message ?? 'Filtro inválido');
    const f = resultado.data;
    const tecnico = fichaTecnico(usuario);
    const filtros: SQL[] = [...alcance(tecnico)];
    if (f.desde) filtros.push(gte(instalaciones.fecha_instalacion, new Date(`${f.desde}T00:00:00-04:00`)));
    if (f.hasta) filtros.push(lte(instalaciones.fecha_instalacion, new Date(`${f.hasta}T23:59:59.999-04:00`)));
    if (tecnico === null && f.tecnico === 'sin') filtros.push(isNull(instalaciones.tecnico_id));
    else if (tecnico === null && typeof f.tecnico === 'number') filtros.push(eq(instalaciones.tecnico_id, f.tecnico));
    if (f.tipo_servicio_id) filtros.push(eq(instalaciones.tipo_servicio_id, f.tipo_servicio_id));
    if (f.estado) filtros.push(eq(instalaciones.estado, f.estado));
    return filtros;
  }

  const aFila = (d: DatosInstalacion) => ({ ...d, fecha_instalacion: d.fecha_instalacion ? new Date(d.fecha_instalacion) : null });

  return new Hono<Entorno>()
    .get('/', async c => c.json(await listar(filtrosDe(c.req.query(), c.get('usuario')))))
    // Conteos con los mismos filtros: total, por técnico y por tipo de servicio.
    .get('/resumen', async c => {
      const condicion = and(eq(instalaciones.aprobacion, 'Aprobada'), ...filtrosDe(c.req.query(), c.get('usuario')));
      const total = sql<number>`count(*)`.mapWith(Number);
      const [porTecnico, porTipo] = await Promise.all([
        bd.select({ tecnico_id: instalaciones.tecnico_id, nombre: tecnicos.nombre, total }).from(instalaciones)
          .leftJoin(tecnicos, eq(tecnicos.id, instalaciones.tecnico_id)).where(condicion)
          .groupBy(instalaciones.tecnico_id, tecnicos.nombre).orderBy(desc(total), asc(tecnicos.nombre)),
        bd.select({ tipo_servicio_id: tiposServicio.id, nombre: tiposServicio.nombre, total }).from(instalaciones)
          .innerJoin(tiposServicio, eq(tiposServicio.id, instalaciones.tipo_servicio_id)).where(condicion)
          .groupBy(tiposServicio.id).orderBy(desc(total)),
      ]);
      const resumen: ResumenInstalaciones = {
        total: porTecnico.reduce((suma, f) => suma + f.total, 0),
        por_tecnico: porTecnico.map(f => ({ tecnico_id: f.tecnico_id, nombre: f.nombre ?? 'Sin técnico', total: f.total })),
        por_tipo: porTipo,
      };
      return c.json(resumen);
    })
    .get('/:id', async c => c.json(await uno(leerId(c), fichaTecnico(c.get('usuario')))))
    .patch('/:id/avance', async c => {
      const id = leerId(c);
      const tecnico = fichaTecnico(c.get('usuario'));
      const datos = await leerJson(c, esquemaAvanceInstalacion);
      const [fila] = await bd.update(instalaciones).set(datos)
        .where(and(eq(instalaciones.id, id), ...alcance(tecnico))).returning({ id: instalaciones.id });
      if (!fila) throw new ErrorHttp(404, 'Instalación no encontrada');
      return c.json(await uno(id));
    })
    .post('/', async c => {
      exigirAdmin(c.get('usuario'));
      const [fila] = await bd.insert(instalaciones).values(aFila(await leerJson(c, esquemaInstalacion))).returning({ id: instalaciones.id });
      return c.json(await uno(fila.id), 201);
    })
    .put('/:id', async c => {
      exigirAdmin(c.get('usuario'));
      const id = leerId(c);
      const [fila] = await bd.update(instalaciones).set(aFila(await leerJson(c, esquemaInstalacion)))
        .where(eq(instalaciones.id, id)).returning({ id: instalaciones.id });
      if (!fila) throw new ErrorHttp(404, 'Instalación no encontrada');
      return c.json(await uno(id));
    })
    .delete('/:id', async c => {
      exigirAdmin(c.get('usuario'));
      const [fila] = await bd.delete(instalaciones).where(eq(instalaciones.id, leerId(c))).returning({ id: instalaciones.id });
      if (!fila) throw new ErrorHttp(404, 'Instalación no encontrada');
      return c.body(null, 204);
    });
}
