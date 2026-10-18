import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { BaseDatos } from './db/cliente';
import type { EnviadorCorreo } from './correo/enviador';
import { crearServicioAutenticacion } from './auth/servicio';
import { crearRutasAutenticacion } from './auth/rutas';
import { requerirRol, requerirSesion, type Entorno } from './auth/middleware';
import { crearRutasUsuarios } from './usuarios/rutas';
import { ErrorHttp } from './http/validacion';
import { traducirErrorBd } from './http/erroresBd';
import { clientes, tecnicos } from './db/esquema';
import { crearRutasPersonas } from './negocio/personas';
import { crearRutasVehiculos } from './negocio/vehiculos';
import { crearRutasGps } from './negocio/gps';
import { crearRutasSimcards } from './negocio/simcards';
import { crearRutasInstalaciones } from './negocio/instalaciones';
import { crearRutasConsultas } from './negocio/consultas';

export interface DependenciasApp {
  bd: BaseDatos;
  enviador: EnviadorCorreo;
  produccion: boolean;
  reloj?: () => Date;
}

// Fábrica sin efectos: el servidor y las pruebas inyectan BD, correo y reloj.
export function crearApp({ bd, enviador, produccion, reloj = () => new Date() }: DependenciasApp) {
  const autenticacion = crearServicioAutenticacion(bd, enviador, reloj);
  const sesion = requerirSesion(autenticacion, produccion);

  const app = new Hono<Entorno>().basePath('/api');
  app.use(secureHeaders());
  app.use(async (c, siguiente) => { await siguiente(); c.header('Cache-Control', 'no-store'); });
  app.get('/salud', c => c.json({ estado: 'ok' }));
  app.route('/auth', crearRutasAutenticacion(autenticacion, produccion));
  app.use('/usuarios/*', sesion, requerirRol('admin'));
  app.route('/usuarios', crearRutasUsuarios(bd));

  // Gestión administrativa. El portal de técnicos (con su propio aislamiento) llega en fase 7.
  const negocio = new Hono<Entorno>();
  negocio.use(sesion, requerirRol('admin'));
  negocio.route('/', crearRutasConsultas(bd));
  negocio.route('/clientes', crearRutasPersonas(bd, clientes, 'Cliente'));
  negocio.route('/tecnicos', crearRutasPersonas(bd, tecnicos, 'Técnico'));
  negocio.route('/vehiculos', crearRutasVehiculos(bd, reloj));
  negocio.route('/gps', crearRutasGps(bd, reloj));
  negocio.route('/simcards', crearRutasSimcards(bd));
  negocio.route('/instalaciones', crearRutasInstalaciones(bd));
  app.route('/', negocio);

  app.notFound(c => c.json({ error: 'Ruta no encontrada' }, 404));
  app.onError((error, c) => {
    const conocido = error instanceof ErrorHttp ? error : traducirErrorBd(error);
    if (conocido) return c.json({ error: conocido.message, detalles: conocido.detalles }, conocido.estado);
    console.error('Error no controlado en la API:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  });
  return app;
}
