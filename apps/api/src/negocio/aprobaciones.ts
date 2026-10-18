import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, type SQL } from 'drizzle-orm';
import {
  claveTexto, esquemaAprobacion, esquemaDesmarcarCosto, esquemaPagoCostos, esquemaRechazo, fechaEnRD,
  type CostoTecnicoFila, type PropuestaCampo,
} from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, gps, instalaciones, planes, servicios, simcards, tecnicos, tiposServicio, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import { registrarAuditoria } from './auditoria';
import { asignarGpsAVehiculo, asignarSimcardAGps, cerrarAsignacionVehiculoDeGps } from './asignaciones';
import { describirVehiculo, listarTrabajos, resumenCostos } from './campo';

// Qué hace cada tipo de servicio sobre el inventario al aprobarse.
type Efecto = 'instalar' | 'retirar' | 'cambiar_sim' | 'ninguno';
function efectoDe(tipo: string): Efecto {
  const clave = claveTexto(tipo);
  if (/desinstal|retiro/.test(clave)) return 'retirar';
  if (clave === 'cambio de sim') return 'cambiar_sim';
  if (/^(instalacion|reinstalacion|venta|cambio de equipo)$/.test(clave)) return 'instalar';
  return 'ninguno';
}

export function crearRutasAprobaciones(bd: BaseDatos, reloj: () => Date) {
  return new Hono<Entorno>()
    .get('/', async c => c.json(await listarTrabajos(bd, [eq(instalaciones.aprobacion, 'Pendiente')], true)))
    .post('/:id/aprobar', async c => {
      const id = leerId(c);
      const datos = await leerJson(c, esquemaAprobacion);
      const usuario = c.get('usuario');
      await bd.transaction(async tx => {
        const [inst] = await tx.select({ inst: instalaciones, tipo: tiposServicio.nombre }).from(instalaciones)
          .innerJoin(tiposServicio, eq(tiposServicio.id, instalaciones.tipo_servicio_id)).where(eq(instalaciones.id, id)).for('update', { of: instalaciones });
        if (!inst) throw new ErrorHttp(404, 'Trabajo no encontrado');
        if (inst.inst.aprobacion !== 'Pendiente') throw new ErrorHttp(409, `El trabajo ya está ${inst.inst.aprobacion.toLowerCase()}`);
        const p = inst.inst.propuesta as PropuestaCampo;
        const ahora = reloj();
        const creados: Record<string, number> = {};

        // Cliente: el elegido por el admin, el que eligió el técnico o uno nuevo con lo propuesto.
        let clienteId = datos.cliente_id ?? p.cliente_id;
        if (clienteId) {
          const [existe] = await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, clienteId));
          if (!existe) throw new ErrorHttp(400, 'El cliente indicado no existe');
        } else {
          if (!p.cliente_nuevo) throw new ErrorHttp(400, 'Indica el cliente del trabajo');
          [{ id: clienteId }] = await tx.insert(clientes).values(p.cliente_nuevo).returning({ id: clientes.id });
          creados.cliente = clienteId;
        }

        // Vehículo: el indicado (debe ser de ese cliente), el del técnico o uno nuevo.
        let vehiculoId = datos.vehiculo_id ?? inst.inst.vehiculo_id;
        if (vehiculoId) {
          const [vehiculo] = await tx.select({ cliente_id: vehiculos.cliente_id }).from(vehiculos).where(eq(vehiculos.id, vehiculoId));
          if (!vehiculo) throw new ErrorHttp(400, 'El vehículo indicado no existe');
          if (vehiculo.cliente_id !== clienteId) throw new ErrorHttp(400, 'El vehículo indicado pertenece a otro cliente');
        } else {
          if (!p.vehiculo_nuevo) throw new ErrorHttp(400, 'Indica el vehículo del trabajo');
          [{ id: vehiculoId }] = await tx.insert(vehiculos).values({ ...p.vehiculo_nuevo, cliente_id: clienteId }).returning({ id: vehiculos.id });
          creados.vehiculo = vehiculoId;
        }

        // GPS y SIM por número: se reutilizan si existen; si no, entran al inventario aquí.
        let [equipo] = await tx.select({ id: gps.id }).from(gps).where(eq(gps.imei, p.imei)).for('update');
        if (!equipo) { [equipo] = await tx.insert(gps).values({ imei: p.imei }).returning({ id: gps.id }); creados.gps = equipo.id; }
        let simId: number | null = null;
        if (p.sim) {
          let [sim] = await tx.select({ id: simcards.id }).from(simcards).where(eq(simcards.numero, p.sim)).for('update');
          if (!sim) { [sim] = await tx.insert(simcards).values({ numero: p.sim }).returning({ id: simcards.id }); creados.simcard = sim.id; }
          simId = sim.id;
        }

        // Asignaciones atómicas según el tipo de servicio (con los mismos bloqueos que el CRUD).
        const efecto = efectoDe(inst.tipo);
        if (efecto === 'instalar') {
          await asignarGpsAVehiculo(tx, vehiculoId, equipo.id, ahora);
          if (simId) await asignarSimcardAGps(tx, equipo.id, simId, ahora);
        } else if (efecto === 'cambiar_sim') {
          if (!simId) throw new ErrorHttp(400, 'Un cambio de SIM necesita el número de la SIM nueva');
          await asignarSimcardAGps(tx, equipo.id, simId, ahora);
        } else if (efecto === 'retirar') {
          await cerrarAsignacionVehiculoDeGps(tx, equipo.id, ahora);
          await tx.update(gps).set({ estado: 'Disponible' }).where(and(eq(gps.id, equipo.id), eq(gps.estado, 'Instalado')));
        }

        if (datos.plan_id) {
          const [plan] = await tx.select().from(planes).where(eq(planes.id, datos.plan_id));
          if (!plan?.activo) throw new ErrorHttp(400, 'El plan indicado no existe o está inactivo');
          const inicio = fechaEnRD(inst.inst.fecha_instalacion ?? ahora);
          const [servicio] = await tx.insert(servicios).values({ vehiculo_id: vehiculoId, plan_id: plan.id, precio: plan.precio, fecha_inicio: inicio, proximo_cobro: inicio })
            .returning({ id: servicios.id });
          creados.servicio = servicio.id;
        }

        await tx.update(instalaciones).set({
          aprobacion: 'Aprobada', vehiculo_id: vehiculoId, gps_id: equipo.id, simcard_id: simId, costo_tecnico: datos.costo_tecnico,
          revisada_por: usuario.id, revisada_at: ahora, ...(datos.notas ? { notas: datos.notas } : {}),
        }).where(eq(instalaciones.id, id));
        await registrarAuditoria(tx, usuario, 'aprobar', 'instalacion', id, { costo_tecnico: datos.costo_tecnico, efecto, creados });
      });
      const [trabajo] = await listarTrabajos(bd, [eq(instalaciones.id, id)]);
      return c.json(trabajo);
    })
    .post('/:id/rechazar', async c => {
      const id = leerId(c);
      const { motivo } = await leerJson(c, esquemaRechazo);
      await bd.transaction(async tx => {
        const [fila] = await tx.update(instalaciones).set({ aprobacion: 'Rechazada', motivo_rechazo: motivo, revisada_por: c.get('usuario').id, revisada_at: reloj() })
          .where(and(eq(instalaciones.id, id), eq(instalaciones.aprobacion, 'Pendiente'))).returning({ id: instalaciones.id });
        if (!fila) throw new ErrorHttp(409, 'Solo se rechaza un trabajo pendiente');
        await registrarAuditoria(tx, c.get('usuario'), 'rechazar', 'instalacion', id, { motivo });
      });
      const [trabajo] = await listarTrabajos(bd, [eq(instalaciones.id, id)]);
      return c.json(trabajo);
    });
}

// Costos de técnicos: lo que se les debe por trabajos aprobados y su pago.
export function crearRutasCostos(bd: BaseDatos, reloj: () => Date) {
  async function listar(filtros: SQL[]): Promise<CostoTecnicoFila[]> {
    const filas = await bd.select({
      inst: instalaciones, tecnico_nombre: tecnicos.nombre, tipo: tiposServicio.nombre,
      marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, cliente_nombre: clientes.nombre,
    }).from(instalaciones)
      .innerJoin(tecnicos, eq(tecnicos.id, instalaciones.tecnico_id))
      .innerJoin(tiposServicio, eq(tiposServicio.id, instalaciones.tipo_servicio_id))
      .innerJoin(vehiculos, eq(vehiculos.id, instalaciones.vehiculo_id))
      .innerJoin(clientes, eq(clientes.id, vehiculos.cliente_id))
      .where(and(eq(instalaciones.aprobacion, 'Aprobada'), isNotNull(instalaciones.costo_tecnico), ...filtros))
      .orderBy(desc(instalaciones.fecha_instalacion), desc(instalaciones.id)).limit(500);
    return filas.map(f => ({
      instalacion_id: f.inst.id, tecnico_id: f.inst.tecnico_id!, tecnico_nombre: f.tecnico_nombre, fecha_instalacion: f.inst.fecha_instalacion?.toISOString() ?? null,
      tipo: f.tipo, cliente_nombre: f.cliente_nombre, vehiculo_descripcion: describirVehiculo(f), costo: f.inst.costo_tecnico!,
      pagado_at: f.inst.costo_pagado_at?.toISOString() ?? null, referencia: f.inst.costo_pago_referencia,
    }));
  }
  const periodo = (desde?: string, hasta?: string) => [
    ...(desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? [gte(instalaciones.fecha_instalacion, new Date(`${desde}T00:00:00-04:00`))] : []),
    ...(hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? [lte(instalaciones.fecha_instalacion, new Date(`${hasta}T23:59:59-04:00`))] : []),
  ];

  return new Hono<Entorno>()
    .get('/', async c => {
      const filtros = periodo(c.req.query('desde'), c.req.query('hasta'));
      const tecnico = Number(c.req.query('tecnico_id'));
      if (Number.isInteger(tecnico) && tecnico > 0) filtros.push(eq(instalaciones.tecnico_id, tecnico));
      const estado = c.req.query('estado');
      if (estado === 'pendientes') filtros.push(isNull(instalaciones.costo_pagado_at));
      else if (estado === 'pagados') filtros.push(isNotNull(instalaciones.costo_pagado_at));
      return c.json(await listar(filtros));
    })
    .get('/resumen', async c => c.json(await resumenCostos(bd, periodo(c.req.query('desde'), c.req.query('hasta')))))
    .post('/pagar', async c => {
      const { instalacion_ids, referencia } = await leerJson(c, esquemaPagoCostos);
      const usuario = c.get('usuario');
      const ids = [...new Set(instalacion_ids)];
      const total = await bd.transaction(async tx => {
        const marcados = await tx.update(instalaciones).set({ costo_pagado_at: reloj(), costo_pago_referencia: referencia })
          .where(and(inArray(instalaciones.id, ids), eq(instalaciones.aprobacion, 'Aprobada'), isNotNull(instalaciones.costo_tecnico), isNull(instalaciones.costo_pagado_at)))
          .returning({ id: instalaciones.id, costo: instalaciones.costo_tecnico });
        // Todo o nada: si alguno ya estaba pagado o no tiene costo, no se marca ninguno.
        if (marcados.length !== ids.length) throw new ErrorHttp(409, 'Algún trabajo ya estaba pagado, no está aprobado o no tiene costo; no se marcó ninguno');
        const suma = Math.round(marcados.reduce((t, m) => t + (m.costo ?? 0) * 100, 0)) / 100;
        await registrarAuditoria(tx, usuario, 'pagar_costos', 'instalaciones', null, { instalacion_ids: ids, referencia, total: suma });
        return suma;
      });
      return c.json({ marcados: ids.length, total });
    })
    .post('/:id/desmarcar', async c => {
      const id = leerId(c);
      const { motivo } = await leerJson(c, esquemaDesmarcarCosto);
      await bd.transaction(async tx => {
        const [anterior] = await tx.select({ pagado: instalaciones.costo_pagado_at, referencia: instalaciones.costo_pago_referencia }).from(instalaciones)
          .where(eq(instalaciones.id, id)).for('update');
        if (!anterior?.pagado) throw new ErrorHttp(409, 'El costo de ese trabajo no está marcado como pagado');
        await tx.update(instalaciones).set({ costo_pagado_at: null, costo_pago_referencia: null }).where(eq(instalaciones.id, id));
        // Reversión auditada: queda constancia de cuándo se había pagado y con qué referencia.
        await registrarAuditoria(tx, c.get('usuario'), 'desmarcar_pago', 'instalacion', id, { motivo, pagado_at: anterior.pagado.toISOString(), referencia: anterior.referencia });
      });
      return c.body(null, 204);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const { costo_tecnico } = await leerJson(c, esquemaAprobacion.pick({ costo_tecnico: true }));
      await bd.transaction(async tx => {
        const [anterior] = await tx.select({ costo: instalaciones.costo_tecnico, pagado: instalaciones.costo_pagado_at, aprobacion: instalaciones.aprobacion })
          .from(instalaciones).where(eq(instalaciones.id, id)).for('update');
        if (!anterior || anterior.aprobacion !== 'Aprobada') throw new ErrorHttp(404, 'Trabajo aprobado no encontrado');
        if (anterior.pagado) throw new ErrorHttp(409, 'El costo ya está pagado; desmárcalo antes de cambiarlo');
        await tx.update(instalaciones).set({ costo_tecnico }).where(eq(instalaciones.id, id));
        await registrarAuditoria(tx, c.get('usuario'), 'cambiar_costo', 'instalacion', id, { antes: anterior.costo, despues: costo_tecnico });
      });
      return c.body(null, 204);
    });
}

