import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import {
  FOTOS_MAXIMAS_POR_TRABAJO, FOTOS_MAXIMAS_POR_VEHICULO, TAMANO_MAXIMO_FOTO, type FotoVehiculo, type UsuarioSesion,
} from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { instalaciones, usuarios, vehiculoImagenes, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { TIPOS_IMAGEN, detectarTipoImagen, type AlmacenArchivos, type TipoImagen } from '../almacen/almacen';
import { leerId } from '../http/erroresBd';
import { ErrorHttp } from '../http/validacion';
import { exigirAccesoVehiculo, fichaTecnico } from './acceso';

export const SEGUNDOS_URL_TEMPORAL = 600;
const MB = 1024 * 1024;
type Ejecutor = Pick<BaseDatos, 'select'>;
type FilaFoto = typeof vehiculoImagenes.$inferSelect;

const limiteCuerpo = bodyLimit({ maxSize: TAMANO_MAXIMO_FOTO + MB, onError: () => { throw new ErrorHttp(413, `La foto supera ${TAMANO_MAXIMO_FOTO / MB} MB`); } });

/** Lee y valida la foto de un formulario multipart (mismo origen, tamaño y formato por firma de bytes). */
async function leerFotoSubida(c: Context<Entorno>) {
  // multipart sí puede enviarse desde un formulario ajeno: además de SameSite, se exige mismo origen.
  const sitio = c.req.header('sec-fetch-site');
  if (sitio && sitio !== 'same-origin' && sitio !== 'none') throw new ErrorHttp(403, 'Origen no permitido');
  const cuerpo = await c.req.parseBody().catch(() => { throw new ErrorHttp(400, 'Se esperaba un formulario multipart con la foto'); });
  const archivo = cuerpo.archivo;
  if (!(archivo instanceof File)) throw new ErrorHttp(400, 'Adjunta la foto en el campo "archivo"');
  if (archivo.size > TAMANO_MAXIMO_FOTO) throw new ErrorHttp(413, `La foto supera ${TAMANO_MAXIMO_FOTO / MB} MB`);
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const tipo = detectarTipoImagen(datos);
  if (!tipo) throw new ErrorHttp(415, 'Formato no admitido: usa JPG, PNG o WebP');
  return { campos: cuerpo, datos, tipo };
}

/**
 * Trabajo de campo cuyas fotos puede ver o tocar el usuario. Admin: cualquiera; técnico: solo los suyos.
 * 404 para no revelar trabajos ajenos.
 */
async function trabajoAccesible(bd: Ejecutor, usuario: UsuarioSesion, id: number, bloquear = false) {
  const tecnico = fichaTecnico(usuario);
  const consulta = bd.select({ id: instalaciones.id, aprobacion: instalaciones.aprobacion, vehiculo_id: instalaciones.vehiculo_id }).from(instalaciones)
    .where(and(eq(instalaciones.id, id), tecnico === null ? undefined : eq(instalaciones.tecnico_id, tecnico)));
  const [trabajo] = bloquear ? await consulta.for('update') : await consulta;
  if (!trabajo) throw new ErrorHttp(404, 'Trabajo no encontrado');
  return trabajo;
}

// Fotos de vehículos y de trabajos de campo en almacenamiento privado.
// Claves: vehiculos/<id>/<uuid>.<ext> y trabajos/<instalacion_id>/<uuid>.<ext>.
export function crearRutasFotos(bd: BaseDatos, almacen: AlmacenArchivos) {
  async function respuesta(filas: { foto: FilaFoto; autor: string | null }[], usuario: UsuarioSesion): Promise<FotoVehiculo[]> {
    const urls = await almacen.urlsTemporales(filas.map(f => f.foto.storage_path), SEGUNDOS_URL_TEMPORAL);
    return filas.flatMap(({ foto, autor }) => {
      const url = urls.get(foto.storage_path);
      return url ? [{
        id: foto.id, url, created_at: foto.created_at.toISOString(), autor, trabajo_id: foto.instalacion_id,
        propia: usuario.rol === 'admin' || foto.subida_por === usuario.id,
      }] : [];
    });
  }

  const listar = (filtro: ReturnType<typeof eq>) => bd.select({ foto: vehiculoImagenes, autor: usuarios.nombre }).from(vehiculoImagenes)
    .leftJoin(usuarios, eq(usuarios.id, vehiculoImagenes.subida_por)).where(filtro).orderBy(asc(vehiculoImagenes.id));

  // Sube al almacén y registra en la misma transacción; si el registro falla, borra el archivo.
  async function guardar(tx: Pick<BaseDatos, 'insert'>, ruta: string, datos: Uint8Array, tipo: TipoImagen, valores: Omit<typeof vehiculoImagenes.$inferInsert, 'storage_path'>) {
    await almacen.subir(ruta, datos, tipo);
    try {
      const [fila] = await tx.insert(vehiculoImagenes).values({ ...valores, storage_path: ruta }).returning();
      return fila;
    } catch (error) {
      await almacen.borrar([ruta]).catch(e => console.error('No se pudo limpiar la foto huérfana:', (e as Error).message));
      throw error;
    }
  }

  return new Hono<Entorno>()
    .get('/', async c => {
      const vehiculoId = Number(c.req.query('vehiculo_id'));
      if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) throw new ErrorHttp(400, 'Indica vehiculo_id');
      const usuario = c.get('usuario');
      await exigirAccesoVehiculo(bd, usuario, vehiculoId);
      return c.json(await respuesta(await listar(eq(vehiculoImagenes.vehiculo_id, vehiculoId)), usuario));
    })
    .post('/', limiteCuerpo, async c => {
      const usuario = c.get('usuario');
      const { campos, datos, tipo } = await leerFotoSubida(c);
      const vehiculoId = Number(campos.vehiculo_id);
      if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) throw new ErrorHttp(400, 'Indica vehiculo_id');
      await exigirAccesoVehiculo(bd, usuario, vehiculoId);

      const ruta = `vehiculos/${vehiculoId}/${randomUUID()}.${TIPOS_IMAGEN[tipo]}`;
      const foto = await bd.transaction(async tx => {
        // Bloquear el vehículo serializa subidas simultáneas: el límite de fotos no se puede rebasar.
        const [vehiculo] = await tx.select({ id: vehiculos.id }).from(vehiculos).where(eq(vehiculos.id, vehiculoId)).for('update');
        if (!vehiculo) throw new ErrorHttp(404, 'Vehículo no encontrado');
        const [{ total }] = await tx.select({ total: count() }).from(vehiculoImagenes)
          .where(and(eq(vehiculoImagenes.vehiculo_id, vehiculoId), isNull(vehiculoImagenes.instalacion_id)));
        if (total >= FOTOS_MAXIMAS_POR_VEHICULO) throw new ErrorHttp(409, `El vehículo ya tiene ${FOTOS_MAXIMAS_POR_VEHICULO} fotos`);
        return guardar(tx, ruta, datos, tipo, { vehiculo_id: vehiculoId, subida_por: usuario.id });
      });
      const [creada] = await respuesta([{ foto, autor: usuario.nombre }], usuario);
      return c.json(creada ?? { id: foto.id, url: '', created_at: foto.created_at.toISOString(), propia: true, autor: usuario.nombre, trabajo_id: null }, 201);
    })
    // Fotos de un trabajo de campo: el técnico las toma al registrarlo, aunque el vehículo aún no exista.
    .get('/trabajo/:id', async c => {
      const usuario = c.get('usuario');
      const trabajo = await trabajoAccesible(bd, usuario, leerId(c));
      return c.json(await respuesta(await listar(eq(vehiculoImagenes.instalacion_id, trabajo.id)), usuario));
    })
    .post('/trabajo/:id', limiteCuerpo, async c => {
      const usuario = c.get('usuario');
      const id = leerId(c);
      const { datos, tipo } = await leerFotoSubida(c);
      const ruta = `trabajos/${id}/${randomUUID()}.${TIPOS_IMAGEN[tipo]}`;
      const foto = await bd.transaction(async tx => {
        // El bloqueo del trabajo serializa subidas en paralelo y una aprobación simultánea.
        const trabajo = await trabajoAccesible(tx, usuario, id, true);
        if (trabajo.aprobacion !== 'Pendiente') throw new ErrorHttp(409, 'Solo se agregan fotos a un trabajo pendiente; después van a la galería del vehículo');
        const [{ total }] = await tx.select({ total: count() }).from(vehiculoImagenes).where(eq(vehiculoImagenes.instalacion_id, id));
        if (total >= FOTOS_MAXIMAS_POR_TRABAJO) throw new ErrorHttp(409, `El trabajo ya tiene ${FOTOS_MAXIMAS_POR_TRABAJO} fotos`);
        return guardar(tx, ruta, datos, tipo, { instalacion_id: id, subida_por: usuario.id });
      });
      const [creada] = await respuesta([{ foto, autor: usuario.nombre }], usuario);
      return c.json(creada ?? { id: foto.id, url: '', created_at: foto.created_at.toISOString(), propia: true, autor: usuario.nombre, trabajo_id: id }, 201);
    })
    .delete('/:id', async c => {
      const usuario = c.get('usuario');
      const id = leerId(c);
      await bd.transaction(async tx => {
        const [foto] = await tx.select().from(vehiculoImagenes).where(eq(vehiculoImagenes.id, id)).for('update');
        if (!foto) throw new ErrorHttp(404, 'Foto no encontrada');
        if (foto.vehiculo_id !== null) await exigirAccesoVehiculo(tx, usuario, foto.vehiculo_id);
        else await trabajoAccesible(tx, usuario, foto.instalacion_id!);
        if (usuario.rol !== 'admin' && foto.subida_por !== usuario.id) throw new ErrorHttp(403, 'Solo puedes borrar las fotos que subiste');
        await tx.delete(vehiculoImagenes).where(eq(vehiculoImagenes.id, id));
        // Si Storage falla, la transacción se revierte y el registro sigue apuntando al archivo.
        try { await almacen.borrar([foto.storage_path]); }
        catch (error) {
          console.error('Fallo al borrar foto en Storage:', (error as Error).message);
          throw new ErrorHttp(502, 'No se pudo borrar la foto del almacenamiento; intenta de nuevo');
        }
      });
      return c.body(null, 204);
    });
}
