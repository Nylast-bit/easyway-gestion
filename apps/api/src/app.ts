import { Hono, type MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { BaseDatos } from './db/cliente';
import type { EnviadorCorreo } from './correo/enviador';
import type { AlmacenArchivos } from './almacen/almacen';
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
import { crearRutasFotos } from './negocio/fotos';
import { crearRutasPlanes, crearRutasTiposServicio } from './negocio/catalogos';
import { crearRutasCobros } from './negocio/cobros';
import { crearRutasVencimientos } from './negocio/vencimientos';
import { crearRutasAuditoria } from './negocio/auditoria';
import { crearRutasImportacion } from './importacion/rutas';
import { crearRutasCampo } from './negocio/campo';
import { crearRutasAprobaciones, crearRutasCostos } from './negocio/aprobaciones';

export interface DependenciasApp {
  bd: BaseDatos;
  enviador: EnviadorCorreo;
  almacen: AlmacenArchivos;
  produccion: boolean;
  reloj?: () => Date;
}

// Fábrica sin efectos: el servidor y las pruebas inyectan BD, correo, almacén y reloj.
export function crearApp({ bd, enviador, almacen, produccion, reloj = () => new Date() }: DependenciasApp) {
  const autenticacion = crearServicioAutenticacion(bd, enviador, reloj);
  const sesion = requerirSesion(autenticacion, produccion);
  const admin = requerirRol('admin');

  const app = new Hono<Entorno>().basePath('/api');
  app.use(secureHeaders());
  app.use(async (c, siguiente) => { await siguiente(); c.header('Cache-Control', 'no-store'); });

  // Permisos declarados por prefijo y de forma explícita: cada ruta nueva debe añadirse aquí.
  const proteger = (prefijo: string, ...middlewares: MiddlewareHandler<Entorno>[]) => {
    app.use(prefijo, ...middlewares);
    app.use(`${prefijo}/*`, ...middlewares);
  };
  for (const prefijo of ['/usuarios', '/resumen', '/buscar', '/clientes', '/tecnicos', '/vehiculos', '/gps', '/simcards',
    '/planes', '/servicios', '/cargos', '/pagos', '/cobros', '/vencimientos', '/auditoria', '/importaciones', '/aprobaciones', '/costos-tecnicos']) proteger(prefijo, sesion, admin);
  // Admin y técnicos; cada ruta aplica el aislamiento por ficha de técnico.
  for (const prefijo of ['/instalaciones', '/fotos', '/tipos-servicio', '/campo']) proteger(prefijo, sesion);

  app.get('/salud', c => c.json({ estado: 'ok' }));
  app.route('/auth', crearRutasAutenticacion(autenticacion, produccion));
  app.route('/usuarios', crearRutasUsuarios(bd));
  app.route('/', crearRutasConsultas(bd));
  app.route('/clientes', crearRutasPersonas(bd, clientes, 'Cliente'));
  app.route('/tecnicos', crearRutasPersonas(bd, tecnicos, 'Técnico'));
  app.route('/vehiculos', crearRutasVehiculos(bd, reloj, almacen));
  app.route('/gps', crearRutasGps(bd, reloj));
  app.route('/simcards', crearRutasSimcards(bd));
  app.route('/instalaciones', crearRutasInstalaciones(bd));
  app.route('/fotos', crearRutasFotos(bd, almacen));
  app.route('/tipos-servicio', crearRutasTiposServicio(bd));
  app.route('/planes', crearRutasPlanes(bd));
  const cobros = crearRutasCobros(bd, reloj);
  app.route('/servicios', cobros.rutasServicios);
  app.route('/cargos', cobros.rutasCargos);
  app.route('/pagos', cobros.rutasPagos);
  app.route('/cobros', cobros.rutasCobros);
  app.route('/vencimientos', crearRutasVencimientos(bd, reloj));
  app.route('/auditoria', crearRutasAuditoria(bd));
  app.route('/importaciones', crearRutasImportacion(bd, reloj));
  app.route('/campo', crearRutasCampo(bd));
  app.route('/aprobaciones', crearRutasAprobaciones(bd, reloj));
  app.route('/costos-tecnicos', crearRutasCostos(bd, reloj));

  // Enlaces firmados del almacén local (desarrollo): la firma con caducidad es la autorización.
  const { leerFirmado } = almacen;
  if (leerFirmado) {
    app.get('/archivos/:token', async c => {
      const archivo = await leerFirmado(c.req.param('token'));
      if (!archivo) throw new ErrorHttp(404, 'Enlace caducado o inválido');
      return c.body(archivo.datos as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': archivo.tipo, 'X-Content-Type-Options': 'nosniff' });
    });
  }

  app.notFound(c => c.json({ error: 'Ruta no encontrada' }, 404));
  app.onError((error, c) => {
    const conocido = error instanceof ErrorHttp ? error : traducirErrorBd(error);
    if (conocido) return c.json({ error: conocido.message, detalles: conocido.detalles }, conocido.estado);
    console.error('Error no controlado en la API:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  });
  return app;
}
