import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { BaseDatos } from '../db/cliente';
import { gps, gpsAsignaciones, simcardAsignaciones, simcards } from '../db/esquema';
import { ErrorHttp } from '../http/validacion';

// Transacción de Drizzle: mismo API de consultas que BaseDatos.
export type Transaccion = Parameters<Parameters<BaseDatos['transaction']>[0]>[0];

/**
 * Deja el vehículo con `gpsId` como único GPS activo (o sin GPS si es null).
 * Cierra asignaciones anteriores y devuelve esos GPS a "Disponible". Debe
 * ejecutarse dentro de una transacción: si algo falla, nada queda a medias.
 */
export async function asignarGpsAVehiculo(tx: Transaccion, vehiculoId: number, gpsId: number | null, ahora: Date) {
  const activas = await tx.select({ id: gpsAsignaciones.id, gps_id: gpsAsignaciones.gps_id }).from(gpsAsignaciones)
    .where(and(eq(gpsAsignaciones.vehiculo_id, vehiculoId), isNull(gpsAsignaciones.fecha_fin))).for('update');
  if (activas.length === 1 && activas[0].gps_id === gpsId) return;

  const aCerrar = activas.filter(a => a.gps_id !== gpsId);
  if (aCerrar.length) {
    await tx.update(gpsAsignaciones).set({ fecha_fin: ahora }).where(inArray(gpsAsignaciones.id, aCerrar.map(a => a.id)));
    await tx.update(gps).set({ estado: 'Disponible' }).where(and(inArray(gps.id, aCerrar.map(a => a.gps_id)), eq(gps.estado, 'Instalado')));
  }
  if (gpsId === null || activas.some(a => a.gps_id === gpsId)) return;

  // Bloqueo de la fila: dos usuarios no pueden instalar el mismo GPS a la vez.
  const [equipo] = await tx.select({ estado: gps.estado }).from(gps).where(eq(gps.id, gpsId)).for('update');
  if (!equipo) throw new ErrorHttp(400, 'El GPS seleccionado no existe');
  if (equipo.estado !== 'Disponible') throw new ErrorHttp(409, `El GPS seleccionado no está disponible (estado: ${equipo.estado})`);
  await tx.insert(gpsAsignaciones).values({ gps_id: gpsId, vehiculo_id: vehiculoId, fecha_inicio: ahora });
  await tx.update(gps).set({ estado: 'Instalado' }).where(eq(gps.id, gpsId));
}

/** Igual que asignarGpsAVehiculo, para la simcard de un GPS. */
export async function asignarSimcardAGps(tx: Transaccion, gpsId: number, simcardId: number | null, ahora: Date) {
  const activas = await tx.select({ id: simcardAsignaciones.id, simcard_id: simcardAsignaciones.simcard_id }).from(simcardAsignaciones)
    .where(and(eq(simcardAsignaciones.gps_id, gpsId), isNull(simcardAsignaciones.fecha_fin))).for('update');
  if (activas.length === 1 && activas[0].simcard_id === simcardId) return;

  const aCerrar = activas.filter(a => a.simcard_id !== simcardId);
  if (aCerrar.length) {
    await tx.update(simcardAsignaciones).set({ fecha_fin: ahora }).where(inArray(simcardAsignaciones.id, aCerrar.map(a => a.id)));
    await tx.update(simcards).set({ estado: 'Disponible' })
      .where(and(inArray(simcards.id, aCerrar.map(a => a.simcard_id)), eq(simcards.estado, 'Asignada')));
  }
  if (simcardId === null || activas.some(a => a.simcard_id === simcardId)) return;

  const [sim] = await tx.select({ estado: simcards.estado }).from(simcards).where(eq(simcards.id, simcardId)).for('update');
  if (!sim) throw new ErrorHttp(400, 'La simcard seleccionada no existe');
  if (sim.estado !== 'Disponible') throw new ErrorHttp(409, `La simcard seleccionada no está disponible (estado: ${sim.estado})`);
  await tx.insert(simcardAsignaciones).values({ simcard_id: simcardId, gps_id: gpsId, fecha_inicio: ahora });
  await tx.update(simcards).set({ estado: 'Asignada' }).where(eq(simcards.id, simcardId));
}

/** Retira el GPS de cualquier vehículo (al marcarlo Retirado, Dañado o Disponible). */
export async function cerrarAsignacionVehiculoDeGps(tx: Transaccion, gpsId: number, ahora: Date) {
  await tx.update(gpsAsignaciones).set({ fecha_fin: ahora })
    .where(and(eq(gpsAsignaciones.gps_id, gpsId), isNull(gpsAsignaciones.fecha_fin)));
}
