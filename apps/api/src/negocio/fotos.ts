import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { asc, count, eq } from 'drizzle-orm';
import { FOTOS_MAXIMAS_POR_VEHICULO, TAMANO_MAXIMO_FOTO, type FotoVehiculo } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { usuarios, vehiculoImagenes, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { TIPOS_IMAGEN, detectarTipoImagen, type AlmacenArchivos } from '../almacen/almacen';
import { leerId } from '../http/erroresBd';
import { ErrorHttp } from '../http/validacion';
import { exigirAccesoVehiculo } from './acceso';

export const SEGUNDOS_URL_TEMPORAL = 600;
const MB = 1024 * 1024;

// Fotos de vehículos en almacenamiento privado. Clave: vehiculos/<id>/<uuid>.<ext>.
export function crearRutasFotos(bd: BaseDatos, almacen: AlmacenArchivos) {
  return new Hono<Entorno>()
    .get('/', async c => {
      const vehiculoId = Number(c.req.query('vehiculo_id'));
      if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) throw new ErrorHttp(400, 'Indica vehiculo_id');
      const usuario = c.get('usuario');
      await exigirAccesoVehiculo(bd, usuario, vehiculoId);
      const filas = await bd.select({ foto: vehiculoImagenes, autor: usuarios.nombre }).from(vehiculoImagenes)
        .leftJoin(usuarios, eq(usuarios.id, vehiculoImagenes.subida_por))
        .where(eq(vehiculoImagenes.vehiculo_id, vehiculoId)).orderBy(asc(vehiculoImagenes.id));
      const urls = await almacen.urlsTemporales(filas.map(f => f.foto.storage_path), SEGUNDOS_URL_TEMPORAL);
      const fotos: FotoVehiculo[] = filas.flatMap(({ foto, autor }) => {
        const url = urls.get(foto.storage_path);
        return url ? [{
          id: foto.id, url, created_at: foto.created_at.toISOString(), autor,
          propia: usuario.rol === 'admin' || foto.subida_por === usuario.id,
        }] : [];
      });
      return c.json(fotos);
    })
    .post('/', bodyLimit({ maxSize: TAMANO_MAXIMO_FOTO + MB, onError: () => { throw new ErrorHttp(413, `La foto supera ${TAMANO_MAXIMO_FOTO / MB} MB`); } }), async c => {
      const usuario = c.get('usuario');
      // multipart sí puede enviarse desde un formulario ajeno: además de SameSite, se exige mismo origen.
      const sitio = c.req.header('sec-fetch-site');
      if (sitio && sitio !== 'same-origin' && sitio !== 'none') throw new ErrorHttp(403, 'Origen no permitido');
      const cuerpo = await c.req.parseBody().catch(() => { throw new ErrorHttp(400, 'Se esperaba un formulario multipart con la foto'); });
      const vehiculoId = Number(cuerpo.vehiculo_id);
      const archivo = cuerpo.archivo;
      if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) throw new ErrorHttp(400, 'Indica vehiculo_id');
      if (!(archivo instanceof File)) throw new ErrorHttp(400, 'Adjunta la foto en el campo "archivo"');
      if (archivo.size > TAMANO_MAXIMO_FOTO) throw new ErrorHttp(413, `La foto supera ${TAMANO_MAXIMO_FOTO / MB} MB`);
      const datos = new Uint8Array(await archivo.arrayBuffer());
      const tipo = detectarTipoImagen(datos);
      if (!tipo) throw new ErrorHttp(415, 'Formato no admitido: usa JPG, PNG o WebP');
      await exigirAccesoVehiculo(bd, usuario, vehiculoId);

      const ruta = `vehiculos/${vehiculoId}/${randomUUID()}.${TIPOS_IMAGEN[tipo]}`;
      const foto = await bd.transaction(async tx => {
        // Bloquear el vehículo serializa subidas simultáneas: el límite de fotos no se puede rebasar.
        const [vehiculo] = await tx.select({ id: vehiculos.id }).from(vehiculos).where(eq(vehiculos.id, vehiculoId)).for('update');
        if (!vehiculo) throw new ErrorHttp(404, 'Vehículo no encontrado');
        const [{ total }] = await tx.select({ total: count() }).from(vehiculoImagenes).where(eq(vehiculoImagenes.vehiculo_id, vehiculoId));
        if (total >= FOTOS_MAXIMAS_POR_VEHICULO) throw new ErrorHttp(409, `El vehículo ya tiene ${FOTOS_MAXIMAS_POR_VEHICULO} fotos`);
        await almacen.subir(ruta, datos, tipo);
        try {
          const [fila] = await tx.insert(vehiculoImagenes).values({ vehiculo_id: vehiculoId, storage_path: ruta, subida_por: usuario.id }).returning();
          return fila;
        } catch (error) {
          // Compensación: sin registro en BD el archivo quedaría huérfano.
          await almacen.borrar([ruta]).catch(e => console.error('No se pudo limpiar la foto huérfana:', (e as Error).message));
          throw error;
        }
      });
      const url = (await almacen.urlsTemporales([ruta], SEGUNDOS_URL_TEMPORAL)).get(ruta) ?? '';
      const respuesta: FotoVehiculo = { id: foto.id, url, created_at: foto.created_at.toISOString(), propia: true, autor: usuario.nombre };
      return c.json(respuesta, 201);
    })
    .delete('/:id', async c => {
      const usuario = c.get('usuario');
      const id = leerId(c);
      await bd.transaction(async tx => {
        const [foto] = await tx.select().from(vehiculoImagenes).where(eq(vehiculoImagenes.id, id)).for('update');
        if (!foto) throw new ErrorHttp(404, 'Foto no encontrada');
        await exigirAccesoVehiculo(tx, usuario, foto.vehiculo_id);
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
