import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { BaseDatos } from './db/cliente';
import type { EnviadorCorreo } from './correo/enviador';
import { crearServicioAutenticacion } from './auth/servicio';
import { crearRutasAutenticacion } from './auth/rutas';
import { requerirRol, requerirSesion, type Entorno } from './auth/middleware';
import { crearRutasUsuarios } from './usuarios/rutas';
import { ErrorHttp } from './http/validacion';

export interface DependenciasApp {
  bd: BaseDatos;
  enviador: EnviadorCorreo;
  produccion: boolean;
  reloj?: () => Date;
}

// Fábrica sin efectos: el servidor y las pruebas inyectan BD, correo y reloj.
export function crearApp({ bd, enviador, produccion, reloj }: DependenciasApp) {
  const autenticacion = crearServicioAutenticacion(bd, enviador, reloj);
  const sesion = requerirSesion(autenticacion, produccion);

  const app = new Hono<Entorno>().basePath('/api');
  app.use(secureHeaders());
  app.use(async (c, siguiente) => { await siguiente(); c.header('Cache-Control', 'no-store'); });
  app.get('/salud', c => c.json({ estado: 'ok' }));
  app.route('/auth', crearRutasAutenticacion(autenticacion, produccion));
  app.use('/usuarios/*', sesion, requerirRol('admin'));
  app.route('/usuarios', crearRutasUsuarios(bd));

  app.notFound(c => c.json({ error: 'Ruta no encontrada' }, 404));
  app.onError((error, c) => {
    if (error instanceof ErrorHttp) return c.json({ error: error.message, detalles: error.detalles }, error.estado);
    console.error('Error no controlado en la API:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  });
  return app;
}
