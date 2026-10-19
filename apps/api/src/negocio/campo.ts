import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  esquemaTrabajoCampo, normalizarClaveNombre,
  type ClienteCampo, type PropuestaCampo, type ResumenCostoTecnico, type TrabajoCampo, type VehiculoCampo,
} from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, gps, gpsAsignaciones, instalaciones, simcards, tecnicos, tiposServicio, usuarios, vehiculoImagenes, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { ErrorHttp, leerJson } from '../http/validacion';
import { fichaTecnico } from './acceso';
import { registrarAuditoria } from './auditoria';

export const describirVehiculo = (v: { marca: string | null; modelo: string | null; placa: string | null }) =>
  `${[v.marca, v.modelo].filter(Boolean).join(' ') || 'Vehículo'} (${v.placa || 'S/P'})`;
const patron = (texto: string) => `%${texto.replace(/[\\%_]/g, c => `\\${c}`)}%`;

/** Trabajos (instalaciones) con datos de la propuesta cuando aún no hay vehículo/GPS enlazados. */
export async function listarTrabajos(bd: Pick<BaseDatos, 'select'>, filtros: SQL[], conCoincidencias = false): Promise<TrabajoCampo[]> {
  const filas = await bd.select({
    inst: instalaciones, tipo: tiposServicio.nombre, tecnico_nombre: tecnicos.nombre, registrada_por_nombre: usuarios.nombre,
    marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, cliente_nombre: clientes.nombre,
    imei: gps.imei, sim: simcards.numero,
    fotos: sql<number>`(SELECT count(*) FROM ${vehiculoImagenes} WHERE ${vehiculoImagenes.instalacion_id} = ${instalaciones.id})`.mapWith(Number),
  }).from(instalaciones)
    .innerJoin(tiposServicio, eq(tiposServicio.id, instalaciones.tipo_servicio_id))
    .leftJoin(tecnicos, eq(tecnicos.id, instalaciones.tecnico_id))
    .leftJoin(usuarios, eq(usuarios.id, instalaciones.registrada_por))
    .leftJoin(vehiculos, eq(vehiculos.id, instalaciones.vehiculo_id))
    .leftJoin(clientes, eq(clientes.id, vehiculos.cliente_id))
    .leftJoin(gps, eq(gps.id, instalaciones.gps_id))
    .leftJoin(simcards, eq(simcards.id, instalaciones.simcard_id))
    .where(and(...filtros)).orderBy(desc(instalaciones.created_at), desc(instalaciones.id)).limit(200);

  const propuestas = filas.map(f => f.inst.propuesta as PropuestaCampo | null);
  const idsClientes = [...new Set(propuestas.flatMap(p => (p?.cliente_id ? [p.cliente_id] : [])))];
  const nombresClientes = idsClientes.length
    ? new Map((await bd.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).where(inArray(clientes.id, idsClientes))).map(c => [c.id, c.nombre]))
    : new Map<number, string>();

  const resultado: TrabajoCampo[] = [];
  for (const [i, f] of filas.entries()) {
    const p = propuestas[i];
    const vehiculo = f.inst.vehiculo_id ? describirVehiculo(f) : p?.vehiculo_nuevo ? `${describirVehiculo(p.vehiculo_nuevo)} · nuevo` : 'Sin vehículo';
    const cliente = f.cliente_nombre ?? (p?.cliente_id ? nombresClientes.get(p.cliente_id) : p?.cliente_nuevo ? `${p.cliente_nuevo.nombre} · nuevo` : null) ?? 'Sin cliente';
    const fila: TrabajoCampo = {
      id: f.inst.id, aprobacion: f.inst.aprobacion, estado: f.inst.estado, tipo: f.tipo,
      fecha_instalacion: f.inst.fecha_instalacion?.toISOString() ?? null, created_at: f.inst.created_at.toISOString(),
      motivo_rechazo: f.inst.motivo_rechazo, notas: f.inst.notas, cliente_nombre: cliente, vehiculo_descripcion: vehiculo,
      imei: f.imei ?? p?.imei ?? '', sim: f.sim ?? p?.sim ?? null, vehiculo_id: f.inst.vehiculo_id,
      costo_tecnico: f.inst.costo_tecnico, costo_pagado_at: f.inst.costo_pagado_at?.toISOString() ?? null,
      tecnico_nombre: f.tecnico_nombre, registrada_por_nombre: f.registrada_por_nombre, fotos: f.fotos, propuesta: p,
      coincidencias: { clientes: [], vehiculos: [], gps: null, simcard: null },
    };
    if (conCoincidencias && p && f.inst.aprobacion === 'Pendiente') fila.coincidencias = await buscarCoincidencias(bd, p);
    resultado.push(fila);
  }
  return resultado;
}

/** Posibles duplicados para que el admin una la propuesta a registros existentes. */
async function buscarCoincidencias(bd: Pick<BaseDatos, 'select'>, p: PropuestaCampo): Promise<TrabajoCampo['coincidencias']> {
  const clave = p.cliente_nuevo ? normalizarClaveNombre(p.cliente_nuevo.nombre) : null;
  const primeraPalabra = p.cliente_nuevo?.nombre.trim().split(/\s+/)[0] ?? '';
  const candidatos = clave && primeraPalabra.length >= 2
    ? await bd.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).where(ilike(clientes.nombre, patron(primeraPalabra))).limit(50)
    : [];
  const clientesIguales: ClienteCampo[] = candidatos.filter(c => normalizarClaveNombre(c.nombre) === clave);
  const v = p.vehiculo_nuevo;
  const vehiculosIguales: VehiculoCampo[] = v && (v.placa || v.chasis)
    ? (await bd.select({ id: vehiculos.id, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, tipo: vehiculos.tipo }).from(vehiculos)
      .where(or(v.placa ? eq(vehiculos.placa, v.placa) : undefined, v.chasis ? eq(vehiculos.chasis, v.chasis) : undefined)).limit(10))
      .map(x => ({ id: x.id, descripcion: describirVehiculo(x), placa: x.placa, tipo: x.tipo }))
    : [];
  const [equipo] = await bd.select({ id: gps.id, estado: gps.estado, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa }).from(gps)
    .leftJoin(gpsAsignaciones, and(eq(gpsAsignaciones.gps_id, gps.id), isNull(gpsAsignaciones.fecha_fin)))
    .leftJoin(vehiculos, eq(vehiculos.id, gpsAsignaciones.vehiculo_id)).where(eq(gps.imei, p.imei));
  const [sim] = p.sim ? await bd.select({ id: simcards.id, estado: simcards.estado }).from(simcards).where(eq(simcards.numero, p.sim)) : [];
  return {
    clientes: clientesIguales, vehiculos: vehiculosIguales,
    gps: equipo ? { id: equipo.id, estado: equipo.estado, vehiculo: equipo.placa || equipo.marca ? describirVehiculo(equipo) : null } : null,
    simcard: sim ?? null,
  };
}

/** Totales de costos aprobados por técnico (pendiente = aprobado con costo y sin pagar). */
export async function resumenCostos(bd: Pick<BaseDatos, 'select'>, filtros: SQL[]): Promise<ResumenCostoTecnico[]> {
  const filas = await bd.select({
    tecnico_id: tecnicos.id, tecnico_nombre: tecnicos.nombre,
    trabajos: sql<number>`count(*)`.mapWith(Number),
    total: sql<number>`coalesce(sum(${instalaciones.costo_tecnico}), 0)`.mapWith(Number),
    pagado: sql<number>`coalesce(sum(${instalaciones.costo_tecnico}) FILTER (WHERE ${instalaciones.costo_pagado_at} IS NOT NULL), 0)`.mapWith(Number),
  }).from(instalaciones).innerJoin(tecnicos, eq(tecnicos.id, instalaciones.tecnico_id))
    .where(and(eq(instalaciones.aprobacion, 'Aprobada'), sql`${instalaciones.costo_tecnico} IS NOT NULL`, ...filtros))
    .groupBy(tecnicos.id).orderBy(asc(tecnicos.nombre));
  return filas.map(f => ({ ...f, pendiente: Math.round((f.total - f.pagado) * 100) / 100 }));
}

// Rutas del técnico en campo. Exigen una cuenta técnica vinculada a su ficha.
export function crearRutasCampo(bd: BaseDatos) {
  const exigirTecnico = (usuario: Parameters<typeof fichaTecnico>[0]) => {
    const ficha = fichaTecnico(usuario);
    if (ficha === null) throw new ErrorHttp(403, 'Solo los técnicos registran trabajos de campo');
    return ficha;
  };

  return new Hono<Entorno>()
    // Búsqueda mínima de clientes (solo id y nombre) para elegir dónde se trabajó.
    .get('/clientes', async c => {
      exigirTecnico(c.get('usuario'));
      const texto = (c.req.query('q') ?? '').trim().slice(0, 60);
      if (texto.length < 2) return c.json([] as ClienteCampo[]);
      const filas = await bd.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes)
        .where(ilike(clientes.nombre, patron(texto))).orderBy(asc(clientes.nombre)).limit(15);
      return c.json(filas satisfies ClienteCampo[]);
    })
    .get('/vehiculos', async c => {
      exigirTecnico(c.get('usuario'));
      const cliente = Number(c.req.query('cliente_id'));
      if (!Number.isInteger(cliente) || cliente <= 0) throw new ErrorHttp(400, 'Indica cliente_id');
      const filas = await bd.select({ id: vehiculos.id, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, tipo: vehiculos.tipo })
        .from(vehiculos).where(eq(vehiculos.cliente_id, cliente)).orderBy(asc(vehiculos.id));
      return c.json(filas.map(v => ({ id: v.id, descripcion: describirVehiculo(v), placa: v.placa, tipo: v.tipo })) satisfies VehiculoCampo[]);
    })
    .get('/trabajos', async c => c.json(await listarTrabajos(bd, [eq(instalaciones.tecnico_id, exigirTecnico(c.get('usuario')))])))
    .post('/trabajos', async c => {
      const usuario = c.get('usuario');
      const ficha = exigirTecnico(usuario);
      const datos = await leerJson(c, esquemaTrabajoCampo);
      const { id, repetido } = await bd.transaction(async tx => {
        if (datos.cliente_id) {
          const [cliente] = await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, datos.cliente_id));
          if (!cliente) throw new ErrorHttp(400, 'El cliente elegido no existe');
        }
        if (datos.vehiculo_id) {
          const [vehiculo] = await tx.select({ cliente_id: vehiculos.cliente_id }).from(vehiculos).where(eq(vehiculos.id, datos.vehiculo_id));
          if (!vehiculo || vehiculo.cliente_id !== datos.cliente_id) throw new ErrorHttp(400, 'El vehículo elegido no pertenece a ese cliente');
        }
        const [tipo] = await tx.select({ activo: tiposServicio.activo }).from(tiposServicio).where(eq(tiposServicio.id, datos.tipo_servicio_id));
        if (!tipo?.activo) throw new ErrorHttp(400, 'Tipo de servicio no disponible');
        const propuesta: PropuestaCampo = { cliente_id: datos.cliente_id, cliente_nuevo: datos.cliente_nuevo, vehiculo_nuevo: datos.vehiculo_nuevo, imei: datos.imei, sim: datos.sim };
        // Nada toca inventario ni asignaciones hasta que un administrador lo apruebe.
        // Con clave de idempotencia, un reenvío del mismo borrador (cola sin conexión) no inserta otra fila:
        // el índice único hace que dos envíos simultáneos esperen uno al otro y solo uno cree el trabajo.
        const [fila] = await tx.insert(instalaciones).values({
          aprobacion: 'Pendiente', estado: 'Completado', vehiculo_id: datos.vehiculo_id, tecnico_id: ficha, registrada_por: usuario.id,
          tipo_servicio_id: datos.tipo_servicio_id, fecha_instalacion: new Date(datos.fecha_instalacion), notas: datos.notas, propuesta,
          clave_idempotencia: datos.clave_idempotencia,
        }).onConflictDoNothing({ target: instalaciones.clave_idempotencia }).returning({ id: instalaciones.id });
        if (!fila) {
          const [previo] = await tx.select({ id: instalaciones.id, registrada_por: instalaciones.registrada_por }).from(instalaciones)
            .where(eq(instalaciones.clave_idempotencia, datos.clave_idempotencia!));
          if (previo?.registrada_por !== usuario.id) throw new ErrorHttp(409, 'Esa clave de envío ya se usó');
          return { id: previo.id, repetido: true };
        }
        await registrarAuditoria(tx, usuario, 'registrar', 'instalacion', fila.id, { imei: datos.imei, cliente_nuevo: Boolean(datos.cliente_nuevo), vehiculo_nuevo: Boolean(datos.vehiculo_nuevo) });
        return { id: fila.id, repetido: false };
      });
      const [trabajo] = await listarTrabajos(bd, [eq(instalaciones.id, id)]);
      return c.json(trabajo, repetido ? 200 : 201);
    })
    .get('/costos', async c => {
      const ficha = exigirTecnico(c.get('usuario'));
      const [resumen] = await resumenCostos(bd, [eq(instalaciones.tecnico_id, ficha)]);
      return c.json(resumen ?? { tecnico_id: ficha, tecnico_nombre: '', trabajos: 0, total: 0, pagado: 0, pendiente: 0 });
    });
}
