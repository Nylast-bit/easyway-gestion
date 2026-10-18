import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  esquemaOpcionesImportacion, fechaEnRD,
  type FilaVistaPrevia, type ImportacionFila, type OpcionesImportacion, type ResumenImportacion,
} from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { importacionFilas, importaciones, usuarios } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';
import { registrarAuditoria } from '../negocio/auditoria';
import { leerLibro, type FilaLeida, type SimLeida } from './analizar';
import { cargarInstantanea, ejecutarPlan, revertirRegistros } from './aplicar';
import { detectarCatalogos, opcionesSugeridas, planificar, type FilaPlanificable, type Instantanea } from './planificar';

const MB = 1024 * 1024;
const HOJA_SIM = 'Simcards';

function resumir(archivo: string, hoja: string, filas: FilaLeida[], planificables: FilaPlanificable[], sims: SimLeida[],
  instantanea: Instantanea, opciones: OpcionesImportacion, hoy: string) {
  const catalogos = detectarCatalogos(planificables, instantanea);
  const plan = planificar(planificables, sims, instantanea, opciones, hoy);
  const resumen: ResumenImportacion = {
    archivo, hoja, filas: filas.length, filas_validas: planificables.length,
    filas_con_error: filas.filter(f => f.errores.length).length,
    filas_con_advertencia: filas.filter(f => !f.errores.length && !f.omitida && (f.advertencias.length || plan.notas.has(planificables.find(p => p.fila === f.fila)?.id ?? -1))).length,
    filas_omitidas: filas.filter(f => f.omitida).length,
    nuevos: plan.conteo, existentes: plan.existentes, ...catalogos,
  };
  return { resumen, plan };
}

// Importación del Excel histórico (solo administradores). El archivo se lee en memoria y no se guarda.
export function crearRutasImportacion(bd: BaseDatos, reloj: () => Date) {
  async function unaImportacion(id: number): Promise<ImportacionFila> {
    const [fila] = await bd.select({ imp: importaciones, creado_por_nombre: usuarios.nombre }).from(importaciones)
      .leftJoin(usuarios, eq(usuarios.id, importaciones.creado_por)).where(eq(importaciones.id, id));
    if (!fila) throw new ErrorHttp(404, 'Importación no encontrada');
    return aFila(fila);
  }
  const aFila = ({ imp, creado_por_nombre }: { imp: typeof importaciones.$inferSelect; creado_por_nombre: string | null }): ImportacionFila => ({
    id: imp.id, archivo_nombre: imp.archivo_nombre, estado: imp.estado, resumen: imp.resumen as ResumenImportacion,
    opciones: imp.opciones as OpcionesImportacion | null, creado_por_nombre, created_at: imp.created_at.toISOString(),
    confirmada_at: imp.confirmada_at?.toISOString() ?? null, revertida_at: imp.revertida_at?.toISOString() ?? null,
  });

  /** Filas guardadas en staging, listas para planificar de nuevo con la BD actual. */
  async function cargarStaging(ejecutor: Pick<BaseDatos, 'select'>, id: number) {
    const filas = await ejecutor.select().from(importacionFilas).where(eq(importacionFilas.importacion_id, id)).orderBy(asc(importacionFilas.fila));
    const instalacion = filas.filter(f => f.hoja !== HOJA_SIM);
    const leidas: FilaLeida[] = instalacion.map(f => ({
      hoja: f.hoja, fila: f.fila, datos: (f.datos as FilaLeida['datos']) ?? null,
      advertencias: f.advertencias as string[], errores: f.errores as string[], omitida: (f.datos as { omitida?: boolean } | null) === null && (f.advertencias as string[]).some(a => a.startsWith('Fila de títulos')),
    }));
    const planificables: FilaPlanificable[] = instalacion.filter(f => f.datos && !(f.errores as string[]).length).map(f => ({ id: f.id, fila: f.fila, datos: f.datos as FilaPlanificable['datos'] }));
    const sims = filas.filter(f => f.hoja === HOJA_SIM).map(f => f.datos as SimLeida);
    return { leidas, planificables, sims };
  }

  const validarOpciones = (opciones: OpcionesImportacion, resumen: ResumenImportacion) => {
    for (const [nombre, lista] of [['tipos', resumen.tipos], ['tecnicos', resumen.tecnicos], ['planes', resumen.planes]] as const) {
      for (const { clave, texto } of lista) {
        const decision = opciones[nombre][clave];
        if (!decision) throw new ErrorHttp(400, `Falta decidir qué hacer con "${texto || '(vacío)'}"`);
        if (nombre === 'tipos' && decision.accion === 'ninguno') throw new ErrorHttp(400, `Cada tipo de servicio necesita un tipo del catálogo: "${texto || '(vacío)'}"`);
      }
    }
  };

  return new Hono<Entorno>()
    .get('/', async c => {
      const filas = await bd.select({ imp: importaciones, creado_por_nombre: usuarios.nombre }).from(importaciones)
        .leftJoin(usuarios, eq(usuarios.id, importaciones.creado_por)).orderBy(desc(importaciones.id)).limit(50);
      return c.json(filas.map(aFila));
    })
    .post('/', bodyLimit({ maxSize: 10 * MB, onError: () => { throw new ErrorHttp(413, 'El archivo supera 10 MB'); } }), async c => {
      const sitio = c.req.header('sec-fetch-site');
      if (sitio && sitio !== 'same-origin' && sitio !== 'none') throw new ErrorHttp(403, 'Origen no permitido');
      const cuerpo = await c.req.parseBody().catch(() => { throw new ErrorHttp(400, 'Adjunta el Excel en el campo "archivo"'); });
      const archivo = cuerpo.archivo;
      if (!(archivo instanceof File)) throw new ErrorHttp(400, 'Adjunta el Excel en el campo "archivo"');
      const contenido = new Uint8Array(await archivo.arrayBuffer());
      const hash = createHash('sha256').update(contenido).digest('hex');
      const [vigente] = await bd.select({ id: importaciones.id, estado: importaciones.estado }).from(importaciones)
        .where(and(eq(importaciones.archivo_hash, hash), inArray(importaciones.estado, ['Analizada', 'Confirmada'])));
      if (vigente) throw new ErrorHttp(409, vigente.estado === 'Confirmada' ? 'Este archivo ya se importó' : 'Este archivo ya está analizado y pendiente de confirmar', { id: vigente.id });

      let libro;
      try { libro = await leerLibro(contenido); }
      catch (error) { throw new ErrorHttp(400, (error as Error).message); }
      const planificables: FilaPlanificable[] = libro.filas.flatMap((f, i) => (f.datos ? [{ id: i, fila: f.fila, datos: f.datos }] : []));
      const instantanea = await cargarInstantanea(bd);
      const opciones = opcionesSugeridas(detectarCatalogos(planificables, instantanea));
      const { resumen, plan } = resumir(archivo.name, libro.hoja, libro.filas, planificables, libro.simcards, instantanea, opciones, fechaEnRD(reloj()));

      const usuario = c.get('usuario');
      const id = await bd.transaction(async tx => {
        const [imp] = await tx.insert(importaciones).values({ archivo_nombre: archivo.name.slice(0, 200), archivo_hash: hash, resumen, opciones, creado_por: usuario.id })
          .returning({ id: importaciones.id });
        const filas = [
          ...libro.filas.map((f, i) => ({
            importacion_id: imp.id, hoja: f.hoja, fila: f.fila, datos: f.datos, errores: f.errores,
            // Las notas de la BD (IMEI o SIM ya existentes) se suman a las advertencias de la fila.
            advertencias: [...f.advertencias, ...(plan.notas.get(i) ?? [])],
          })),
          ...libro.simcards.map((s, i) => ({ importacion_id: imp.id, hoja: HOJA_SIM, fila: i + 1, datos: s, errores: [], advertencias: [] })),
        ];
        for (let i = 0; i < filas.length; i += 500) await tx.insert(importacionFilas).values(filas.slice(i, i + 500));
        await registrarAuditoria(tx, usuario, 'analizar', 'importacion', imp.id, { archivo: archivo.name, filas: resumen.filas, errores: resumen.filas_con_error });
        return imp.id;
      });
      return c.json(await unaImportacion(id), 201);
    })
    .get('/:id', async c => c.json(await unaImportacion(leerId(c))))
    .get('/:id/filas', async c => {
      const id = leerId(c);
      const filtro = c.req.query('filtro') ?? 'problemas';
      const desde = Math.max(Number(c.req.query('desde')) || 0, 0);
      const condiciones = [eq(importacionFilas.importacion_id, id), sql`${importacionFilas.hoja} <> ${HOJA_SIM}`];
      if (filtro === 'errores') condiciones.push(sql`jsonb_array_length(${importacionFilas.errores}) > 0`);
      else if (filtro === 'problemas') condiciones.push(sql`(jsonb_array_length(${importacionFilas.errores}) > 0 OR jsonb_array_length(${importacionFilas.advertencias}) > 0)`);
      const filas = await bd.select().from(importacionFilas).where(and(...condiciones)).orderBy(asc(importacionFilas.fila)).limit(200).offset(desde);
      const resultado: FilaVistaPrevia[] = filas.map(f => ({
        id: f.id, hoja: f.hoja, fila: f.fila, datos: f.datos as FilaVistaPrevia['datos'], advertencias: f.advertencias as string[], errores: f.errores as string[],
      }));
      return c.json(resultado);
    })
    .post('/:id/previsualizar', async c => {
      const id = leerId(c);
      const opciones = await leerJson(c, esquemaOpcionesImportacion);
      const importacion = await unaImportacion(id);
      if (importacion.estado !== 'Analizada') throw new ErrorHttp(409, 'La importación ya no está pendiente de confirmar');
      const { leidas, planificables, sims } = await cargarStaging(bd, id);
      const { resumen } = resumir(importacion.archivo_nombre, importacion.resumen.hoja, leidas, planificables, sims, await cargarInstantanea(bd), opciones, fechaEnRD(reloj()));
      return c.json(resumen);
    })
    .post('/:id/confirmar', async c => {
      const id = leerId(c);
      const opciones = await leerJson(c, esquemaOpcionesImportacion);
      const usuario = c.get('usuario');
      await bd.transaction(async tx => {
        const [imp] = await tx.select().from(importaciones).where(eq(importaciones.id, id)).for('update');
        if (!imp) throw new ErrorHttp(404, 'Importación no encontrada');
        if (imp.estado !== 'Analizada') throw new ErrorHttp(409, imp.estado === 'Confirmada' ? 'La importación ya está confirmada' : 'La importación ya no está pendiente de confirmar');
        validarOpciones(opciones, imp.resumen as ResumenImportacion);
        // Se planifica de nuevo contra la BD dentro de la transacción: refleja cambios desde el análisis.
        const { leidas, planificables, sims } = await cargarStaging(tx, id);
        const ahora = reloj();
        const { resumen, plan } = resumir(imp.archivo_nombre, (imp.resumen as ResumenImportacion).hoja, leidas, planificables, sims, await cargarInstantanea(tx), opciones, fechaEnRD(ahora));
        const registros = await ejecutarPlan(tx, plan, id, usuario.id, ahora);
        await tx.update(importaciones).set({ estado: 'Confirmada', resumen, opciones, confirmada_por: usuario.id, confirmada_at: ahora }).where(eq(importaciones.id, id));
        await registrarAuditoria(tx, usuario, 'confirmar', 'importacion', id, { creados: plan.conteo, existentes: plan.existentes, registros });
      });
      return c.json(await unaImportacion(id));
    })
    .post('/:id/descartar', async c => {
      const id = leerId(c);
      await bd.transaction(async tx => {
        const [imp] = await tx.update(importaciones).set({ estado: 'Descartada' })
          .where(and(eq(importaciones.id, id), eq(importaciones.estado, 'Analizada'))).returning({ id: importaciones.id });
        if (!imp) throw new ErrorHttp(409, 'Solo se descarta una importación pendiente de confirmar');
        // El staging contiene datos personales: no se conserva si no se va a usar.
        await tx.delete(importacionFilas).where(eq(importacionFilas.importacion_id, id));
        await registrarAuditoria(tx, c.get('usuario'), 'descartar', 'importacion', id);
      });
      return c.json(await unaImportacion(id));
    })
    .post('/:id/revertir', async c => {
      const id = leerId(c);
      const usuario = c.get('usuario');
      await bd.transaction(async tx => {
        const [imp] = await tx.select({ estado: importaciones.estado }).from(importaciones).where(eq(importaciones.id, id)).for('update');
        if (!imp) throw new ErrorHttp(404, 'Importación no encontrada');
        if (imp.estado !== 'Confirmada') throw new ErrorHttp(409, 'Solo se revierte una importación confirmada');
        const borrados = await revertirRegistros(tx, id);
        await tx.update(importaciones).set({ estado: 'Revertida', revertida_por: usuario.id, revertida_at: reloj() }).where(eq(importaciones.id, id));
        await tx.delete(importacionFilas).where(eq(importacionFilas.importacion_id, id));
        await registrarAuditoria(tx, usuario, 'revertir', 'importacion', id, { borrados });
      });
      return c.json(await unaImportacion(id));
    });
}
