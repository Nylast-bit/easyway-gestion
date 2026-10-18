import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { esquemaActualizarUsuario, esquemaCrearUsuario, esquemaRestablecerContrasena, type UsuarioFila } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { sesiones, tecnicos, usuarios } from '../db/esquema';
import { hashearContrasena } from '../auth/criptografia';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';

// Gestión de cuentas. Montado detrás de requerirSesion + requerirRol('admin') en app.ts.
// Nunca devuelve el hash de la contraseña.
export function crearRutasUsuarios(bd: BaseDatos) {
  async function listar(id?: number): Promise<UsuarioFila[]> {
    const filas = await bd.select({ u: usuarios, tecnico_nombre: tecnicos.nombre }).from(usuarios)
      .leftJoin(tecnicos, eq(tecnicos.id, usuarios.tecnico_id))
      .where(id ? eq(usuarios.id, id) : undefined).orderBy(asc(usuarios.nombre));
    return filas.map(({ u, tecnico_nombre }) => ({
      id: u.id, nombre: u.nombre, usuario: u.usuario, correo: u.correo, rol: u.rol, tecnico_id: u.tecnico_id,
      activo: u.activo, correo_verificado: Boolean(u.correo_verificado_at),
      bloqueado_hasta: u.bloqueado_hasta?.toISOString() ?? null, tecnico_nombre, created_at: u.created_at.toISOString(),
    }));
  }

  async function uno(id: number) {
    const [fila] = await listar(id);
    if (!fila) throw new ErrorHttp(404, 'Usuario no encontrado');
    return fila;
  }

  return new Hono<Entorno>()
    .get('/', async c => c.json(await listar()))
    .post('/', async c => {
      const datos = await leerJson(c, esquemaCrearUsuario);
      const [creado] = await bd.insert(usuarios).values({
        nombre: datos.nombre, usuario: datos.usuario ?? null, correo: datos.correo ?? null,
        contrasena_hash: await hashearContrasena(datos.contrasena), rol: datos.rol, tecnico_id: datos.tecnico_id ?? null,
      }).returning({ id: usuarios.id });
      return c.json({ usuario: await uno(creado.id) }, 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const datos = await leerJson(c, esquemaActualizarUsuario);
      const yo = c.get('usuario');
      // Evita quedarse sin acceso: un admin no puede desactivarse ni quitarse el rol a sí mismo.
      if (id === yo.id && (!datos.activo || datos.rol !== 'admin')) throw new ErrorHttp(409, 'No puedes desactivarte ni quitarte el rol de administrador');
      await bd.transaction(async tx => {
        const [fila] = await tx.update(usuarios).set({ ...datos, ...(datos.activo ? { intentos_fallidos: 0, bloqueado_hasta: null } : {}) })
          .where(eq(usuarios.id, id)).returning({ id: usuarios.id });
        if (!fila) throw new ErrorHttp(404, 'Usuario no encontrado');
        // Desactivar o cambiar rol/ficha cierra las sesiones de esa cuenta: los permisos nuevos aplican de inmediato.
        // La propia sesión se conserva (el admin no puede quitarse permisos a sí mismo).
        if (id !== yo.id) await tx.delete(sesiones).where(eq(sesiones.usuario_id, id));
      });
      return c.json(await uno(id));
    })
    .put('/:id/contrasena', async c => {
      const id = leerId(c);
      const { contrasena } = await leerJson(c, esquemaRestablecerContrasena);
      await bd.transaction(async tx => {
        const [fila] = await tx.update(usuarios)
          .set({ contrasena_hash: await hashearContrasena(contrasena), intentos_fallidos: 0, bloqueado_hasta: null })
          .where(eq(usuarios.id, id)).returning({ id: usuarios.id });
        if (!fila) throw new ErrorHttp(404, 'Usuario no encontrado');
        await tx.delete(sesiones).where(eq(sesiones.usuario_id, id));
      });
      return c.body(null, 204);
    });
}
