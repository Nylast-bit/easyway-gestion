import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import {
  esquemaActualizarServicio, esquemaAnulacion, esquemaCargo, esquemaGenerarCargos, esquemaPago, esquemaReferenciaFactura, esquemaServicio,
  fechaEnRD, mesesPorPeriodo, sumarDias, sumarMeses,
  type CargoFila, type EstadoCargo, type EstadoCuenta, type PagoFila, type ResumenCobros, type ServicioFila,
} from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { cargos, clientes, pagoAplicaciones, pagos, planes, servicios, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import { registrarAuditoria } from './auditoria';
import type { Transaccion } from './asignaciones';

// Importes en céntimos enteros para comparar y repartir sin errores de coma flotante.
const centimos = (valor: number) => Math.round(valor * 100);
const pesos = (valor: number) => valor / 100;
const MAX_PERIODOS_POR_GENERACION = 120;

export function crearRutasCobros(bd: BaseDatos, reloj: () => Date) {
  const hoy = () => fechaEnRD(reloj());

  // Lo pagado de cada cargo cuenta solo aplicaciones de pagos no anulados.
  const pagadoPorCargo = () => bd.select({
    cargo_id: pagoAplicaciones.cargo_id,
    pagado: sql<number>`coalesce(sum(${pagoAplicaciones.monto}), 0)`.mapWith(Number).as('pagado'),
  }).from(pagoAplicaciones).innerJoin(pagos, and(eq(pagos.id, pagoAplicaciones.pago_id), isNull(pagos.anulado_at)))
    .groupBy(pagoAplicaciones.cargo_id).as('pagado_por_cargo');

  async function listarCargos(filtros: SQL[]): Promise<CargoFila[]> {
    const pagado = pagadoPorCargo();
    const filas = await bd.select({ cargo: cargos, cliente_nombre: clientes.nombre, pagado: pagado.pagado }).from(cargos)
      .innerJoin(clientes, eq(clientes.id, cargos.cliente_id))
      .leftJoin(pagado, eq(pagado.cargo_id, cargos.id))
      .where(and(...filtros)).orderBy(asc(cargos.fecha_vencimiento), asc(cargos.id));
    const fecha = hoy();
    return filas.map(({ cargo, cliente_nombre, pagado: abonado }) => {
      const anulado = cargo.anulado_at !== null;
      const pagadoCent = centimos(abonado ?? 0);
      const saldoCent = anulado ? 0 : Math.max(centimos(cargo.monto) - pagadoCent, 0);
      const estado: EstadoCargo = anulado ? 'Anulado' : saldoCent === 0 ? 'Pagado' : pagadoCent > 0 ? 'Parcial' : 'Pendiente';
      return {
        id: cargo.id, cliente_id: cargo.cliente_id, cliente_nombre, servicio_id: cargo.servicio_id, concepto: cargo.concepto,
        periodo_inicio: cargo.periodo_inicio, periodo_fin: cargo.periodo_fin, monto: cargo.monto, pagado: pesos(pagadoCent),
        saldo: pesos(saldoCent), fecha_vencimiento: cargo.fecha_vencimiento, vencido: saldoCent > 0 && cargo.fecha_vencimiento < fecha,
        estado, referencia_factura: cargo.referencia_factura, motivo_anulacion: cargo.motivo_anulacion, created_at: cargo.created_at.toISOString(),
      };
    });
  }

  async function listarPagos(filtros: SQL[]): Promise<PagoFila[]> {
    const filas = await bd.select({ pago: pagos, cliente_nombre: clientes.nombre }).from(pagos)
      .innerJoin(clientes, eq(clientes.id, pagos.cliente_id)).where(and(...filtros)).orderBy(desc(pagos.fecha), desc(pagos.id));
    if (!filas.length) return [];
    const aplicaciones = await bd.select({ pago_id: pagoAplicaciones.pago_id, cargo_id: pagoAplicaciones.cargo_id, monto: pagoAplicaciones.monto, concepto: cargos.concepto })
      .from(pagoAplicaciones).innerJoin(cargos, eq(cargos.id, pagoAplicaciones.cargo_id))
      .where(inArray(pagoAplicaciones.pago_id, filas.map(f => f.pago.id))).orderBy(asc(pagoAplicaciones.id));
    return filas.map(({ pago, cliente_nombre }) => {
      const propias = aplicaciones.filter(a => a.pago_id === pago.id);
      const anulado = pago.anulado_at !== null;
      const aplicadoCent = anulado ? 0 : propias.reduce((total, a) => total + centimos(a.monto), 0);
      return {
        id: pago.id, cliente_id: pago.cliente_id, cliente_nombre, fecha: pago.fecha, monto: pago.monto, metodo: pago.metodo,
        referencia: pago.referencia, notas: pago.notas, aplicado: pesos(aplicadoCent),
        sin_aplicar: anulado ? 0 : pesos(centimos(pago.monto) - aplicadoCent), anulado, motivo_anulacion: pago.motivo_anulacion,
        aplicaciones: propias.map(a => ({ cargo_id: a.cargo_id, concepto: a.concepto, monto: a.monto })), created_at: pago.created_at.toISOString(),
      };
    });
  }

  async function listarServicios(filtros: SQL[]): Promise<ServicioFila[]> {
    const filas = await bd.select({
      servicio: servicios, plan_nombre: planes.nombre, periodicidad: planes.periodicidad,
      marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa, cliente_id: clientes.id, cliente_nombre: clientes.nombre,
    }).from(servicios).innerJoin(planes, eq(planes.id, servicios.plan_id)).innerJoin(vehiculos, eq(vehiculos.id, servicios.vehiculo_id))
      .innerJoin(clientes, eq(clientes.id, vehiculos.cliente_id)).where(and(...filtros)).orderBy(asc(servicios.proximo_cobro), asc(servicios.id));
    return filas.map(({ servicio, plan_nombre, periodicidad, marca, modelo, placa, cliente_id, cliente_nombre }) => ({
      id: servicio.id, vehiculo_id: servicio.vehiculo_id, plan_id: servicio.plan_id, plan_nombre, periodicidad,
      precio: servicio.precio, fecha_inicio: servicio.fecha_inicio, proximo_cobro: servicio.proximo_cobro, estado: servicio.estado,
      notas: servicio.notas, vehiculo: { marca, modelo, placa, cliente_id, cliente_nombre },
    }));
  }

  async function unCargo(id: number) {
    const [fila] = await listarCargos([eq(cargos.id, id)]);
    if (!fila) throw new ErrorHttp(404, 'Cargo no encontrado');
    return fila;
  }
  async function unPago(id: number) {
    const [fila] = await listarPagos([eq(pagos.id, id)]);
    if (!fila) throw new ErrorHttp(404, 'Pago no encontrado');
    return fila;
  }
  async function unServicio(id: number) {
    const [fila] = await listarServicios([eq(servicios.id, id)]);
    if (!fila) throw new ErrorHttp(404, 'Servicio no encontrado');
    return fila;
  }
  async function exigirCliente(ejecutor: Pick<BaseDatos, 'select'>, id: number) {
    const [fila] = await ejecutor.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, id));
    if (!fila) throw new ErrorHttp(400, 'El cliente indicado no existe');
  }

  /** Saldo actual (céntimos) de cargos ya bloqueados con FOR UPDATE por el llamador. */
  async function saldos(tx: Transaccion, ids: number[]) {
    if (!ids.length) return new Map<number, number>();
    const abonos = await tx.select({ cargo_id: pagoAplicaciones.cargo_id, pagado: sql<number>`coalesce(sum(${pagoAplicaciones.monto}), 0)`.mapWith(Number) })
      .from(pagoAplicaciones).innerJoin(pagos, and(eq(pagos.id, pagoAplicaciones.pago_id), isNull(pagos.anulado_at)))
      .where(inArray(pagoAplicaciones.cargo_id, ids)).groupBy(pagoAplicaciones.cargo_id);
    return new Map(abonos.map(a => [a.cargo_id, centimos(a.pagado)]));
  }

  const rutasServicios = new Hono<Entorno>()
    .get('/', async c => {
      const filtros: SQL[] = [];
      const vehiculo = Number(c.req.query('vehiculo_id'));
      const cliente = Number(c.req.query('cliente_id'));
      if (Number.isInteger(vehiculo) && vehiculo > 0) filtros.push(eq(servicios.vehiculo_id, vehiculo));
      if (Number.isInteger(cliente) && cliente > 0) filtros.push(eq(vehiculos.cliente_id, cliente));
      return c.json(await listarServicios(filtros));
    })
    .post('/', async c => {
      const datos = await leerJson(c, esquemaServicio);
      const id = await bd.transaction(async tx => {
        const [plan] = await tx.select().from(planes).where(eq(planes.id, datos.plan_id));
        if (!plan) throw new ErrorHttp(400, 'El plan indicado no existe');
        if (!plan.activo) throw new ErrorHttp(409, 'El plan está inactivo; elige un plan vigente');
        const [vehiculo] = await tx.select({ id: vehiculos.id }).from(vehiculos).where(eq(vehiculos.id, datos.vehiculo_id));
        if (!vehiculo) throw new ErrorHttp(400, 'El vehículo indicado no existe');
        const [fila] = await tx.insert(servicios).values({
          vehiculo_id: datos.vehiculo_id, plan_id: plan.id, precio: datos.precio ?? plan.precio,
          fecha_inicio: datos.fecha_inicio, proximo_cobro: datos.fecha_inicio, notas: datos.notas,
        }).returning({ id: servicios.id });
        await registrarAuditoria(tx, c.get('usuario'), 'crear', 'servicio', fila.id, { ...datos, precio: datos.precio ?? plan.precio });
        return fila.id;
      });
      return c.json(await unServicio(id), 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const datos = await leerJson(c, esquemaActualizarServicio);
      await bd.transaction(async tx => {
        const [anterior] = await tx.select().from(servicios).where(eq(servicios.id, id)).for('update');
        if (!anterior) throw new ErrorHttp(404, 'Servicio no encontrado');
        if (datos.proximo_cobro < anterior.fecha_inicio) throw new ErrorHttp(400, 'El próximo cobro no puede ser anterior al inicio del servicio');
        await tx.update(servicios).set(datos).where(eq(servicios.id, id));
        await registrarAuditoria(tx, c.get('usuario'), 'actualizar', 'servicio', id, {
          antes: { precio: anterior.precio, proximo_cobro: anterior.proximo_cobro, estado: anterior.estado }, despues: datos,
        });
      });
      return c.json(await unServicio(id));
    });

  const rutasCargos = new Hono<Entorno>()
    .get('/', async c => {
      const filtros: SQL[] = [];
      const cliente = Number(c.req.query('cliente_id'));
      if (Number.isInteger(cliente) && cliente > 0) filtros.push(eq(cargos.cliente_id, cliente));
      let lista = await listarCargos(filtros);
      const estado = c.req.query('estado');
      if (estado === 'pendientes') lista = lista.filter(f => f.saldo > 0);
      else if (estado === 'vencidos') lista = lista.filter(f => f.vencido);
      return c.json(lista);
    })
    .post('/generar', async c => {
      const { hasta } = await leerJson(c, esquemaGenerarCargos);
      const usuario = c.get('usuario');
      const resultado = await bd.transaction(async tx => {
        // Bloquea los servicios a facturar: dos generaciones simultáneas no duplican periodos.
        const pendientes = await tx.select({ servicio: servicios, cliente_id: vehiculos.cliente_id, placa: vehiculos.placa, plan_nombre: planes.nombre, periodicidad: planes.periodicidad })
          .from(servicios).innerJoin(vehiculos, eq(vehiculos.id, servicios.vehiculo_id)).innerJoin(planes, eq(planes.id, servicios.plan_id))
          .where(and(eq(servicios.estado, 'Activo'), lte(servicios.proximo_cobro, hasta))).orderBy(asc(servicios.id)).for('update', { of: servicios });
        let creados = 0;
        for (const { servicio, cliente_id, placa, plan_nombre, periodicidad } of pendientes) {
          let inicio = servicio.proximo_cobro;
          for (let vuelta = 0; inicio <= hasta && vuelta < MAX_PERIODOS_POR_GENERACION; vuelta++) {
            const siguiente = sumarMeses(inicio, mesesPorPeriodo[periodicidad]);
            if (servicio.precio > 0) {
              const insertados = await tx.insert(cargos).values({
                cliente_id, servicio_id: servicio.id, concepto: `${plan_nombre}${placa ? ` · ${placa}` : ''}`,
                periodo_inicio: inicio, periodo_fin: sumarDias(siguiente, -1), monto: servicio.precio,
                fecha_vencimiento: inicio, creado_por: usuario.id,
              }).onConflictDoNothing().returning({ id: cargos.id });
              creados += insertados.length;
            }
            inicio = siguiente;
          }
          await tx.update(servicios).set({ proximo_cobro: inicio }).where(eq(servicios.id, servicio.id));
        }
        await registrarAuditoria(tx, usuario, 'generar', 'cargos', null, { hasta, servicios: pendientes.length, creados });
        return { servicios: pendientes.length, creados };
      });
      return c.json(resultado);
    })
    .post('/', async c => {
      const datos = await leerJson(c, esquemaCargo);
      const id = await bd.transaction(async tx => {
        await exigirCliente(tx, datos.cliente_id);
        const [fila] = await tx.insert(cargos).values({ ...datos, creado_por: c.get('usuario').id }).returning({ id: cargos.id });
        await registrarAuditoria(tx, c.get('usuario'), 'crear', 'cargo', fila.id, datos);
        return fila.id;
      });
      return c.json(await unCargo(id), 201);
    })
    .put('/:id/referencia', async c => {
      const id = leerId(c);
      const { referencia_factura } = await leerJson(c, esquemaReferenciaFactura);
      await bd.transaction(async tx => {
        const [fila] = await tx.update(cargos).set({ referencia_factura }).where(eq(cargos.id, id)).returning({ id: cargos.id });
        if (!fila) throw new ErrorHttp(404, 'Cargo no encontrado');
        await registrarAuditoria(tx, c.get('usuario'), 'referenciar', 'cargo', id, { referencia_factura });
      });
      return c.json(await unCargo(id));
    })
    .post('/:id/anular', async c => {
      const id = leerId(c);
      const { motivo } = await leerJson(c, esquemaAnulacion);
      await bd.transaction(async tx => {
        const [cargo] = await tx.select().from(cargos).where(eq(cargos.id, id)).for('update');
        if (!cargo) throw new ErrorHttp(404, 'Cargo no encontrado');
        if (cargo.anulado_at) throw new ErrorHttp(409, 'El cargo ya está anulado');
        if ((await saldos(tx, [id])).get(id)) throw new ErrorHttp(409, 'El cargo tiene pagos aplicados; anula primero esos pagos');
        await tx.update(cargos).set({ anulado_at: reloj(), anulado_por: c.get('usuario').id, motivo_anulacion: motivo }).where(eq(cargos.id, id));
        await registrarAuditoria(tx, c.get('usuario'), 'anular', 'cargo', id, { motivo, monto: cargo.monto });
      });
      return c.json(await unCargo(id));
    });

  const rutasPagos = new Hono<Entorno>()
    .get('/', async c => {
      const cliente = Number(c.req.query('cliente_id'));
      return c.json(await listarPagos(Number.isInteger(cliente) && cliente > 0 ? [eq(pagos.cliente_id, cliente)] : []));
    })
    .post('/', async c => {
      const datos = await leerJson(c, esquemaPago);
      const usuario = c.get('usuario');
      const id = await bd.transaction(async tx => {
        await exigirCliente(tx, datos.cliente_id);
        const montoCent = centimos(datos.monto);
        // Bloqueo en orden de id: pagos simultáneos del mismo cliente se serializan sin interbloqueos.
        const candidatos = await tx.select().from(cargos)
          .where(and(eq(cargos.cliente_id, datos.cliente_id), isNull(cargos.anulado_at),
            datos.aplicaciones ? inArray(cargos.id, datos.aplicaciones.map(a => a.cargo_id)) : undefined))
          .orderBy(asc(cargos.id)).for('update');
        const abonado = await saldos(tx, candidatos.map(cargo => cargo.id));
        const saldoDe = (cargo: typeof candidatos[number]) => centimos(cargo.monto) - (abonado.get(cargo.id) ?? 0);

        let aplicaciones: { cargo_id: number; centimos: number }[];
        if (datos.aplicaciones) {
          const repetidos = new Set<number>();
          aplicaciones = datos.aplicaciones.map(a => {
            if (repetidos.has(a.cargo_id)) throw new ErrorHttp(400, 'Un cargo aparece dos veces en el pago');
            repetidos.add(a.cargo_id);
            const cargo = candidatos.find(x => x.id === a.cargo_id);
            if (!cargo) throw new ErrorHttp(400, `El cargo ${a.cargo_id} no es un cargo vigente de este cliente`);
            if (centimos(a.monto) > saldoDe(cargo)) throw new ErrorHttp(409, `El monto aplicado al cargo ${a.cargo_id} supera su saldo (RD$${pesos(saldoDe(cargo)).toFixed(2)})`);
            return { cargo_id: a.cargo_id, centimos: centimos(a.monto) };
          });
          if (aplicaciones.reduce((t, a) => t + a.centimos, 0) > montoCent) throw new ErrorHttp(400, 'Las aplicaciones suman más que el pago');
        } else {
          // Automático: cubre primero lo que vence antes.
          let restante = montoCent;
          aplicaciones = [];
          for (const cargo of [...candidatos].sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.id - b.id)) {
            const aplicar = Math.min(restante, saldoDe(cargo));
            if (aplicar > 0) { aplicaciones.push({ cargo_id: cargo.id, centimos: aplicar }); restante -= aplicar; }
            if (!restante) break;
          }
        }

        const [pago] = await tx.insert(pagos).values({
          cliente_id: datos.cliente_id, fecha: datos.fecha, monto: datos.monto, metodo: datos.metodo,
          referencia: datos.referencia, notas: datos.notas, registrado_por: usuario.id,
        }).returning({ id: pagos.id });
        if (aplicaciones.length) {
          await tx.insert(pagoAplicaciones).values(aplicaciones.map(a => ({ pago_id: pago.id, cargo_id: a.cargo_id, monto: pesos(a.centimos) })));
        }
        await registrarAuditoria(tx, usuario, 'crear', 'pago', pago.id, {
          cliente_id: datos.cliente_id, monto: datos.monto, metodo: datos.metodo, referencia: datos.referencia,
          aplicaciones: aplicaciones.map(a => ({ cargo_id: a.cargo_id, monto: pesos(a.centimos) })),
        });
        return pago.id;
      });
      return c.json(await unPago(id), 201);
    })
    .post('/:id/anular', async c => {
      const id = leerId(c);
      const { motivo } = await leerJson(c, esquemaAnulacion);
      await bd.transaction(async tx => {
        const [pago] = await tx.update(pagos).set({ anulado_at: reloj(), anulado_por: c.get('usuario').id, motivo_anulacion: motivo })
          .where(and(eq(pagos.id, id), isNull(pagos.anulado_at))).returning({ id: pagos.id, monto: pagos.monto });
        if (!pago) {
          const [existe] = await tx.select({ id: pagos.id }).from(pagos).where(eq(pagos.id, id));
          throw existe ? new ErrorHttp(409, 'El pago ya está anulado') : new ErrorHttp(404, 'Pago no encontrado');
        }
        // Las aplicaciones se conservan como historial; al estar el pago anulado dejan de contar.
        await registrarAuditoria(tx, c.get('usuario'), 'anular', 'pago', id, { motivo, monto: pago.monto });
      });
      return c.json(await unPago(id));
    });

  const rutasCobros = new Hono<Entorno>()
    .get('/estado-cuenta/:id', async c => {
      const id = leerId(c);
      const [cliente] = await bd.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).where(eq(clientes.id, id));
      if (!cliente) throw new ErrorHttp(404, 'Cliente no encontrado');
      const [listaCargos, listaPagos, listaServicios] = await Promise.all([
        listarCargos([eq(cargos.cliente_id, id)]), listarPagos([eq(pagos.cliente_id, id)]), listarServicios([eq(vehiculos.cliente_id, id)]),
      ]);
      const suma = (valores: number[]) => pesos(valores.reduce((t, v) => t + centimos(v), 0));
      const vigentes = listaCargos.filter(f => f.estado !== 'Anulado');
      const estado: EstadoCuenta = {
        cliente, cargos: listaCargos, pagos: listaPagos, servicios: listaServicios,
        total_cargado: suma(vigentes.map(f => f.monto)),
        total_pagado: suma(listaPagos.filter(p => !p.anulado).map(p => p.monto)),
        saldo_pendiente: suma(vigentes.map(f => f.saldo)),
        saldo_vencido: suma(vigentes.filter(f => f.vencido).map(f => f.saldo)),
        saldo_a_favor: suma(listaPagos.map(p => p.sin_aplicar)),
      };
      return c.json(estado);
    })
    .get('/resumen', async c => {
      const fecha = hoy();
      const [pendientes, [porGenerar], [cobrado]] = await Promise.all([
        listarCargos([isNull(cargos.anulado_at)]),
        bd.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(servicios)
          .where(and(eq(servicios.estado, 'Activo'), lte(servicios.proximo_cobro, fecha))),
        bd.select({ total: sql<number>`coalesce(sum(${pagos.monto}), 0)`.mapWith(Number) }).from(pagos)
          .where(and(isNull(pagos.anulado_at), gte(pagos.fecha, `${fecha.slice(0, 7)}-01`), lte(pagos.fecha, fecha))),
      ]);
      const porCliente = new Map<number, { cliente_id: number; cliente_nombre: string; saldo: number; vencido: number }>();
      for (const cargo of pendientes.filter(f => f.saldo > 0)) {
        const actual = porCliente.get(cargo.cliente_id) ?? { cliente_id: cargo.cliente_id, cliente_nombre: cargo.cliente_nombre, saldo: 0, vencido: 0 };
        actual.saldo = pesos(centimos(actual.saldo) + centimos(cargo.saldo));
        if (cargo.vencido) actual.vencido = pesos(centimos(actual.vencido) + centimos(cargo.saldo));
        porCliente.set(cargo.cliente_id, actual);
      }
      const deudores = [...porCliente.values()].sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
      const resumen: ResumenCobros = {
        pendiente: pesos(deudores.reduce((t, d) => t + centimos(d.saldo), 0)),
        vencido: pesos(deudores.reduce((t, d) => t + centimos(d.vencido), 0)),
        clientes_con_deuda: deudores.length, cobrado_mes: cobrado.total, por_generar: porGenerar.total, deudores: deudores.slice(0, 50),
      };
      return c.json(resumen);
    });

  return { rutasServicios, rutasCargos, rutasPagos, rutasCobros };
}
