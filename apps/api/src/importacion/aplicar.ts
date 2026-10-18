import { eq, inArray } from 'drizzle-orm';
import type { BaseDatos } from '../db/cliente';
import {
  clientes, gps, gpsAsignaciones, importacionRegistros, instalaciones, planes, servicios, simcardAsignaciones, simcards,
  tecnicos, tiposServicio, vehiculoImagenes, vehiculos,
} from '../db/esquema';
import type { Transaccion } from '../negocio/asignaciones';
import { ErrorHttp } from '../http/validacion';
import type { Instantanea, PlanImportacion, Ref } from './planificar';

const LOTE = 400;
// Fechas de calendario del Excel → instante a mediodía en Santo Domingo (evita cambios de día por zona).
const instante = (fecha: string | null, porDefecto: Date) => (fecha ? new Date(`${fecha}T12:00:00-04:00`) : porDefecto);

/** Inserta en lotes y devuelve los ids en el mismo orden que las filas (RETURNING conserva el orden de VALUES). */
async function insertarLotes<T>(filas: T[], insertar: (lote: T[]) => Promise<{ id: number }[]>) {
  const ids: number[] = [];
  for (let i = 0; i < filas.length; i += LOTE) ids.push(...(await insertar(filas.slice(i, i + LOTE))).map(f => f.id));
  return ids;
}

export async function cargarInstantanea(ejecutor: Pick<BaseDatos, 'select'>): Promise<Instantanea> {
  const [listaClientes, listaVehiculos, listaGps, listaSims, listaTecnicos, listaPlanes, listaTipos, conServicio] = await Promise.all([
    ejecutor.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes),
    ejecutor.select({ id: vehiculos.id, cliente_id: vehiculos.cliente_id, placa: vehiculos.placa, chasis: vehiculos.chasis }).from(vehiculos),
    ejecutor.select({ id: gps.id, imei: gps.imei }).from(gps),
    ejecutor.select({ id: simcards.id, numero: simcards.numero }).from(simcards),
    ejecutor.select({ id: tecnicos.id, nombre: tecnicos.nombre }).from(tecnicos),
    ejecutor.select({ id: planes.id, nombre: planes.nombre, activo: planes.activo, periodicidad: planes.periodicidad, precio: planes.precio }).from(planes),
    ejecutor.select({ id: tiposServicio.id, nombre: tiposServicio.nombre }).from(tiposServicio),
    ejecutor.select({ vehiculo_id: servicios.vehiculo_id }).from(servicios).where(eq(servicios.estado, 'Activo')),
  ]);
  return {
    clientes: listaClientes, vehiculos: listaVehiculos, gps: listaGps, simcards: listaSims, tecnicos: listaTecnicos,
    planes: listaPlanes, tipos: listaTipos, vehiculosConServicio: conServicio.map(s => s.vehiculo_id),
  };
}

/** Ejecuta un plan ya calculado dentro de la transacción del llamador y registra lo creado. */
export async function ejecutarPlan(tx: Transaccion, plan: PlanImportacion, importacionId: number, usuarioId: number, ahora: Date) {
  const creados: { tabla: string; registro_id: number }[] = [];
  const mapas = new Map<string, Map<string, number>>();
  const anotar = (tabla: string, claves: string[], ids: number[]) => {
    const mapa = new Map<string, number>();
    ids.forEach((id, i) => { mapa.set(claves[i], id); creados.push({ tabla, registro_id: id }); });
    mapas.set(tabla, mapa);
  };
  const resolver = (tabla: string, ref: Ref) => {
    if ('id' in ref) return ref.id;
    const id = mapas.get(tabla)?.get(ref.nuevo);
    if (id === undefined) throw new Error(`Referencia sin resolver: ${tabla}/${ref.nuevo}`);
    return id;
  };

  anotar('tecnicos', plan.tecnicos.map(t => t.clave),
    await insertarLotes(plan.tecnicos, l => tx.insert(tecnicos).values(l.map(t => ({ nombre: t.nombre }))).returning({ id: tecnicos.id })));
  // Planes históricos: inactivos y sin precio; el admin decide si los reactiva.
  anotar('planes', plan.planes.map(p => p.clave),
    await insertarLotes(plan.planes, l => tx.insert(planes).values(l.map(p => ({ nombre: p.nombre, periodicidad: p.periodicidad, precio: 0, activo: false }))).returning({ id: planes.id })));
  anotar('tipos_servicio', plan.tipos.map(t => t.clave),
    await insertarLotes(plan.tipos, l => tx.insert(tiposServicio).values(l.map(t => ({ nombre: t.nombre }))).returning({ id: tiposServicio.id })));
  anotar('clientes', plan.clientes.map(c => c.clave),
    await insertarLotes(plan.clientes, l => tx.insert(clientes).values(l.map(({ clave: _clave, ...c }) => c)).returning({ id: clientes.id })));
  anotar('vehiculos', plan.vehiculos.map(v => v.clave),
    await insertarLotes(plan.vehiculos, l => tx.insert(vehiculos).values(l.map(({ clave: _clave, cliente, ...v }) => ({ ...v, cliente_id: resolver('clientes', cliente) }))).returning({ id: vehiculos.id })));
  anotar('gps', plan.gps.map(g => g.clave),
    await insertarLotes(plan.gps, l => tx.insert(gps).values(l.map(({ clave: _clave, ...g }) => g)).returning({ id: gps.id })));
  anotar('simcards', plan.simcards.map(s => s.clave),
    await insertarLotes(plan.simcards, l => tx.insert(simcards).values(l.map(({ clave: _clave, ...s }) => s)).returning({ id: simcards.id })));

  const idsInstalaciones = await insertarLotes(plan.instalaciones, l => tx.insert(instalaciones).values(l.map(i => ({
    vehiculo_id: resolver('vehiculos', i.vehiculo), gps_id: resolver('gps', i.gps),
    simcard_id: i.simcard ? resolver('simcards', i.simcard) : null, tecnico_id: i.tecnico ? resolver('tecnicos', i.tecnico) : null,
    tipo_servicio_id: resolver('tipos_servicio', i.tipo), fecha_instalacion: i.fecha ? instante(i.fecha, ahora) : null,
    estado: 'Completado' as const, aprobacion: 'Aprobada' as const, registrada_por: usuarioId, notas: `Importado del Excel (fila ${i.fila})`,
  }))).returning({ id: instalaciones.id }));
  idsInstalaciones.forEach(id => creados.push({ tabla: 'instalaciones', registro_id: id }));

  const idsAsigGps = await insertarLotes(plan.asignacionesGps, l => tx.insert(gpsAsignaciones).values(l.map(a => ({
    gps_id: resolver('gps', a.gps), vehiculo_id: resolver('vehiculos', a.vehiculo),
    fecha_inicio: instante(a.inicio, ahora), fecha_fin: a.fin ? instante(a.fin, ahora) : null,
  }))).returning({ id: gpsAsignaciones.id }));
  idsAsigGps.forEach(id => creados.push({ tabla: 'gps_asignaciones', registro_id: id }));

  const idsAsigSim = await insertarLotes(plan.asignacionesSim, l => tx.insert(simcardAsignaciones).values(l.map(a => ({
    simcard_id: resolver('simcards', a.simcard), gps_id: resolver('gps', a.gps),
    fecha_inicio: instante(a.inicio, ahora), fecha_fin: a.fin ? instante(a.fin, ahora) : null,
  }))).returning({ id: simcardAsignaciones.id }));
  idsAsigSim.forEach(id => creados.push({ tabla: 'simcard_asignaciones', registro_id: id }));

  const idsServicios = await insertarLotes(plan.servicios, l => tx.insert(servicios).values(l.map(s => ({
    vehiculo_id: resolver('vehiculos', s.vehiculo), plan_id: resolver('planes', s.plan), precio: s.precio,
    fecha_inicio: s.fecha_inicio, proximo_cobro: s.proximo_cobro, notas: 'Creado por la importación del Excel',
  }))).returning({ id: servicios.id }));
  idsServicios.forEach(id => creados.push({ tabla: 'servicios', registro_id: id }));

  for (let i = 0; i < creados.length; i += LOTE) {
    await tx.insert(importacionRegistros).values(creados.slice(i, i + LOTE).map(c => ({ ...c, importacion_id: importacionId })));
  }
  return creados.length;
}

// Orden inverso de dependencias: primero lo que referencia, después lo referenciado.
const ORDEN_REVERSION = [
  ['servicios', servicios], ['simcard_asignaciones', simcardAsignaciones], ['gps_asignaciones', gpsAsignaciones],
  ['instalaciones', instalaciones], ['simcards', simcards], ['gps', gps], ['vehiculos', vehiculos], ['clientes', clientes],
  ['planes', planes], ['tipos_servicio', tiposServicio], ['tecnicos', tecnicos],
] as const;

/**
 * Borra solo lo que creó la importación. Si algo creado después depende de esos registros
 * (cargos, pagos, fotos, nuevas instalaciones, cuentas de técnico...), la clave foránea lo impide
 * y la transacción completa se revierte: no queda nada a medias.
 */
export async function revertirRegistros(tx: Transaccion, importacionId: number) {
  const registros = await tx.select({ tabla: importacionRegistros.tabla, registro_id: importacionRegistros.registro_id })
    .from(importacionRegistros).where(eq(importacionRegistros.importacion_id, importacionId));
  const porTabla = new Map<string, number[]>();
  for (const r of registros) porTabla.set(r.tabla, [...(porTabla.get(r.tabla) ?? []), r.registro_id]);
  // Las fotos de vehículos importados se subieron después: impiden revertir.
  const vehiculosImportados = porTabla.get('vehiculos') ?? [];
  if (vehiculosImportados.length) {
    const [foto] = await tx.select({ id: vehiculoImagenes.id }).from(vehiculoImagenes).where(inArray(vehiculoImagenes.vehiculo_id, vehiculosImportados)).limit(1);
    if (foto) throw new ErrorHttp(409, 'No se puede revertir: hay fotos subidas a vehículos de esta importación. Bórralas primero.');
  }
  const borrados: Record<string, number> = {};
  try {
    for (const [nombre, tabla] of ORDEN_REVERSION) {
      const ids = porTabla.get(nombre) ?? [];
      for (let i = 0; i < ids.length; i += LOTE) {
        await tx.delete(tabla).where(inArray(tabla.id, ids.slice(i, i + LOTE)));
      }
      if (ids.length) borrados[nombre] = ids.length;
    }
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === '23503' || (error as { code?: string }).code === '23503') {
      throw new ErrorHttp(409, 'No se puede revertir: hay datos creados después que usan registros de esta importación (cargos, pagos, instalaciones o cuentas de técnico). No se ha borrado nada.');
    }
    throw error;
  }
  await tx.delete(importacionRegistros).where(eq(importacionRegistros.importacion_id, importacionId));
  return borrados;
}

