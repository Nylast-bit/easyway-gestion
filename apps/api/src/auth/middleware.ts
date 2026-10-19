import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { RolUsuario, UsuarioSesion } from '@easyway/shared';
import type { ServicioAutenticacion } from './servicio';
import { ErrorHttp } from '../http/validacion';

export const COOKIE_SESION = 'easyway_sesion';

export type Entorno = { Variables: { usuario: UsuarioSesion } };

export function escribirCookieSesion(c: Context, token: string, expira: Date, segura: boolean) {
  setCookie(c, COOKIE_SESION, token, { httpOnly: true, secure: segura, sameSite: 'Lax', path: '/', expires: expira });
}

export function borrarCookieSesion(c: Context, segura: boolean) {
  deleteCookie(c, COOKIE_SESION, { path: '/', secure: segura });
}

export const leerTokenSesion = (c: Context) => getCookie(c, COOKIE_SESION);

// Borra la cookie inválida para que la web no quede en un ciclo de redirecciones.
// Con una contraseña pendiente de cambio solo pasan las rutas que lo permiten (sesión y cambio).
export function requerirSesion(servicio: ServicioAutenticacion, segura: boolean, opciones: { permitirCambioPendiente?: boolean } = {}): MiddlewareHandler<Entorno> {
  return async (c, siguiente) => {
    const token = leerTokenSesion(c);
    const usuario = token ? await servicio.obtenerSesion(token) : null;
    if (!usuario) {
      if (token) borrarCookieSesion(c, segura);
      throw new ErrorHttp(401, 'Sesión no iniciada o caducada');
    }
    if (usuario.debe_cambiar_contrasena && !opciones.permitirCambioPendiente) {
      throw new ErrorHttp(403, 'Debes cambiar tu contraseña antes de continuar', { cambiar_contrasena: true });
    }
    c.set('usuario', usuario);
    await siguiente();
  };
}

export function requerirRol(...roles: RolUsuario[]): MiddlewareHandler<Entorno> {
  return async (c, siguiente) => {
    if (!roles.includes(c.get('usuario').rol)) throw new ErrorHttp(403, 'No tienes permiso para esta acción');
    await siguiente();
  };
}
