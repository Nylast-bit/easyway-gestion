import { Hono } from 'hono';
import { esquemaCrearUsuario } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { usuarios } from '../db/esquema';
import { hashearContrasena } from '../auth/criptografia';
import type { Entorno } from '../auth/middleware';
import { ErrorHttp, leerJson } from '../http/validacion';

// Montado detrás de requerirSesion + requerirRol('admin') en app.ts.
export function crearRutasUsuarios(bd: BaseDatos) {
  return new Hono<Entorno>()
    .post('/', async c => {
      const datos = await leerJson(c, esquemaCrearUsuario);
      try {
        const [creado] = await bd.insert(usuarios).values({
          nombre: datos.nombre, usuario: datos.usuario ?? null, correo: datos.correo ?? null,
          contrasena_hash: await hashearContrasena(datos.contrasena), rol: datos.rol, tecnico_id: datos.tecnico_id ?? null,
        }).returning({ id: usuarios.id, nombre: usuarios.nombre, usuario: usuarios.usuario, correo: usuarios.correo, rol: usuarios.rol, tecnico_id: usuarios.tecnico_id });
        return c.json({ usuario: creado }, 201);
      } catch (error) {
        const codigo = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
        if (codigo === '23505') throw new ErrorHttp(409, 'Ya existe una cuenta con ese usuario, correo o técnico');
        if (codigo === '23503') throw new ErrorHttp(400, 'El técnico indicado no existe');
        throw error;
      }
    });
}
