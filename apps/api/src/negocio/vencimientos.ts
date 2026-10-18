import { Hono } from 'hono';
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { esquemaFechaVencimiento, esquemaVencimientos, fechaEnRD, sumarDias, type VencimientoFila } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, gps, gpsAsignaciones, planes, servicios, simcardAsignaciones, simcards, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import { registrarAuditoria } from './auditoria';

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
const describir = (v: { marca: string | null; modelo: string | null; placa: string | null }) =>
  `${[v.marca, v.modelo].filter(Boolean).join(' ') || 'Vehículo'} (${v.placa || 'S/P'})`;

// GPS, SIM y servicios que vencen en los próximos N días (incluye los ya vencidos).
export function crearRutasVencimientos(bd: BaseDatos, reloj: () => Date) {
  return new Hono<Entorno>()
    .get('/', async c => {
      const { dias } = esquemaVencimientos.parse({ dias: c.req.query('dias') ?? undefined });
      const hoy = fechaEnRD(reloj());
      const limite = sumarDias(hoy, dias);
      const [equipos, sims, planesPorCobrar] = await Promise.all([
        bd.select({ id: gps.id, imei: gps.imei, fecha: gps.fecha_vencimiento, vehiculo_id: vehiculos.id, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, cliente_nombre: clientes.nombre })
          .from(gps).leftJoin(gpsAsignaciones, and(eq(gpsAsignaciones.gps_id, gps.id), isNull(gpsAsignaciones.fecha_fin)))
          .leftJoin(vehiculos, eq(vehiculos.id, gpsAsignaciones.vehiculo_id)).leftJoin(clientes, eq(clientes.id, vehiculos.cliente_id))
          .where(and(isNotNull(gps.fecha_vencimiento), lte(gps.fecha_vencimiento, limite))),
        bd.select({ id: simcards.id, numero: simcards.numero, fecha: simcards.fecha_vencimiento, vehiculo_id: vehiculos.id, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, cliente_nombre: clientes.nombre })
          .from(simcards).leftJoin(simcardAsignaciones, and(eq(simcardAsignaciones.simcard_id, simcards.id), isNull(simcardAsignaciones.fecha_fin)))
          .leftJoin(gpsAsignaciones, and(eq(gpsAsignaciones.gps_id, simcardAsignaciones.gps_id), isNull(gpsAsignaciones.fecha_fin)))
          .leftJoin(vehiculos, eq(vehiculos.id, gpsAsignaciones.vehiculo_id)).leftJoin(clientes, eq(clientes.id, vehiculos.cliente_id))
          .where(and(isNotNull(simcards.fecha_vencimiento), lte(simcards.fecha_vencimiento, limite))),
        bd.select({ id: servicios.id, plan: planes.nombre, fecha: servicios.proximo_cobro, vehiculo_id: vehiculos.id, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, cliente_nombre: clientes.nombre })
          .from(servicios).innerJoin(planes, eq(planes.id, servicios.plan_id)).innerJoin(vehiculos, eq(vehiculos.id, servicios.vehiculo_id))
          .innerJoin(clientes, eq(clientes.id, vehiculos.cliente_id))
          .where(and(eq(servicios.estado, 'Activo'), lte(servicios.proximo_cobro, limite))),
      ]);
      const vehiculo = (f: { vehiculo_id: number | null; marca: string | null; modelo: string | null; placa: string | null; cliente_nombre: string | null }) =>
        f.vehiculo_id ? { id: f.vehiculo_id, descripcion: describir(f), cliente_nombre: f.cliente_nombre ?? '' } : null;
      const filas: VencimientoFila[] = [
        ...equipos.map(f => ({ tipo: 'gps' as const, id: f.id, identificador: f.imei, fecha: f.fecha!, dias_restantes: diasEntre(hoy, f.fecha!), vehiculo: vehiculo(f) })),
        ...sims.map(f => ({ tipo: 'simcard' as const, id: f.id, identificador: f.numero, fecha: f.fecha!, dias_restantes: diasEntre(hoy, f.fecha!), vehiculo: vehiculo(f) })),
        ...planesPorCobrar.map(f => ({ tipo: 'servicio' as const, id: f.id, identificador: f.plan, fecha: f.fecha, dias_restantes: diasEntre(hoy, f.fecha), vehiculo: vehiculo(f) })),
      ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo));
      return c.json(filas);
    })
    // Corrección manual de la vigencia de un equipo (p. ej. un cliente que pagó más de un año).
    .put('/:tipo/:id', async c => {
      const tipo = c.req.param('tipo');
      if (tipo !== 'gps' && tipo !== 'simcard') throw new ErrorHttp(404, 'Ruta no encontrada');
      const id = leerId(c);
      const { fecha_vencimiento } = await leerJson(c, esquemaFechaVencimiento);
      await bd.transaction(async tx => {
        const tabla = tipo === 'gps' ? gps : simcards;
        const [anterior] = await tx.select({ fecha: tabla.fecha_vencimiento }).from(tabla).where(eq(tabla.id, id)).for('update');
        if (!anterior) throw new ErrorHttp(404, tipo === 'gps' ? 'GPS no encontrado' : 'Simcard no encontrada');
        await tx.update(tabla).set({ fecha_vencimiento }).where(eq(tabla.id, id));
        await registrarAuditoria(tx, c.get('usuario'), 'cambiar_vencimiento', tipo, id, { antes: anterior.fecha, despues: fecha_vencimiento });
      });
      return c.body(null, 204);
    });
}
