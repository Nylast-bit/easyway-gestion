import { Hono } from 'hono';
import {
  esquemaCambiarContrasena, esquemaConfirmarRecuperacion, esquemaLogin, esquemaReenviarCodigo, esquemaRecuperarPorCedula,
  esquemaRecuperarPorCorreo, esquemaVerificarCorreo, type RespuestaLogin, type RespuestaRecuperacion, type RespuestaRecuperacionCedula,
} from '@easyway/shared';
import { borrarCookieSesion, escribirCookieSesion, leerTokenSesion, requerirSesion, type Entorno } from './middleware';
import type { ServicioAutenticacion } from './servicio';
import { ErrorHttp, leerJson } from '../http/validacion';

const minutosRestantes = (hasta: Date) => Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 60_000));

export function crearRutasAutenticacion(servicio: ServicioAutenticacion, cookieSegura: boolean) {
  // Sesión y cambio de contraseña siguen disponibles aunque el cambio esté pendiente.
  const sesion = requerirSesion(servicio, cookieSegura, { permitirCambioPendiente: true });
  const codigoFallido = (tipo: 'expirado' | 'agotado' | 'incorrecto', restantes = 0): never => {
    if (tipo === 'expirado') throw new ErrorHttp(410, 'El código caducó. Solicita uno nuevo.');
    if (tipo === 'agotado') throw new ErrorHttp(429, 'Demasiados intentos. Solicita un código nuevo.');
    throw new ErrorHttp(400, `Código incorrecto. Te quedan ${restantes} intentos.`);
  };

  return new Hono<Entorno>()
    .post('/login', async c => {
      const { identificador, contrasena } = await leerJson(c, esquemaLogin);
      const resultado = await servicio.iniciarSesion(identificador, contrasena);
      switch (resultado.tipo) {
        // Mismo mensaje para cuenta inexistente o contraseña incorrecta: no revela qué cuentas existen.
        case 'invalido': throw new ErrorHttp(401, 'Usuario o contraseña incorrectos');
        case 'bloqueado': throw new ErrorHttp(423, `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${minutosRestantes(resultado.hasta)} min.`);
        case 'inactivo': throw new ErrorHttp(403, 'Cuenta desactivada. Contacta con un administrador.');
        case 'envio_fallido': throw new ErrorHttp(502, 'No se pudo enviar el código de verificación. Intenta de nuevo en unos minutos.');
        case 'verificacion': {
          const cuerpo: RespuestaLogin = { estado: 'verificacion_requerida', desafio: resultado.desafio, correo: resultado.correo, reintentarEn: resultado.reintentarEn };
          return c.json(cuerpo, 202);
        }
        case 'sesion': {
          escribirCookieSesion(c, resultado.token, resultado.expira, cookieSegura);
          const cuerpo: RespuestaLogin = { estado: 'sesion_iniciada', usuario: resultado.usuario };
          return c.json(cuerpo);
        }
      }
    })
    .post('/verificar-correo', async c => {
      const { desafio, codigo } = await leerJson(c, esquemaVerificarCorreo);
      const resultado = await servicio.verificarCorreo(desafio, codigo);
      switch (resultado.tipo) {
        case 'expirado': throw new ErrorHttp(410, 'El código caducó. Solicita uno nuevo o vuelve a iniciar sesión.');
        case 'agotado': throw new ErrorHttp(429, 'Demasiados intentos. Solicita un código nuevo.');
        case 'incorrecto': throw new ErrorHttp(400, `Código incorrecto. Te quedan ${resultado.restantes} intentos.`);
        case 'sesion': {
          escribirCookieSesion(c, resultado.token, resultado.expira, cookieSegura);
          const cuerpo: RespuestaLogin = { estado: 'sesion_iniciada', usuario: resultado.usuario };
          return c.json(cuerpo);
        }
      }
    })
    .post('/reenviar-codigo', async c => {
      const { desafio } = await leerJson(c, esquemaReenviarCodigo);
      const resultado = await servicio.reenviarCodigo(desafio);
      switch (resultado.tipo) {
        case 'expirado': throw new ErrorHttp(410, 'La verificación caducó. Vuelve a iniciar sesión.');
        case 'limite': throw new ErrorHttp(429, 'Se alcanzó el máximo de reenvíos. Vuelve a iniciar sesión más tarde.');
        case 'espera': throw new ErrorHttp(429, `Espera ${resultado.segundos} s antes de pedir otro código.`, { reintentarEn: resultado.segundos });
        case 'envio_fallido': throw new ErrorHttp(502, 'No se pudo enviar el código. Intenta de nuevo en unos minutos.');
        case 'enviado': return c.json({ reintentarEn: resultado.reintentarEn });
      }
    })
    // Contraseña olvidada con correo: siempre 202 con un desafío (exista o no la cuenta).
    .post('/recuperar', async c => {
      const { correo } = await leerJson(c, esquemaRecuperarPorCorreo);
      const resultado = await servicio.solicitarRecuperacion(correo);
      switch (resultado.tipo) {
        case 'espera': throw new ErrorHttp(429, `Espera ${resultado.segundos} s antes de pedir otro código.`, { reintentarEn: resultado.segundos });
        case 'limite': throw new ErrorHttp(429, 'Se alcanzó el máximo de códigos por hora. Intenta más tarde.');
        case 'envio_fallido': throw new ErrorHttp(502, 'No se pudo enviar el código. Intenta de nuevo en unos minutos.');
        case 'verificacion': {
          const cuerpo: RespuestaRecuperacion = { desafio: resultado.desafio, correo: resultado.correo, reintentarEn: resultado.reintentarEn };
          return c.json(cuerpo, 202);
        }
      }
    })
    .post('/recuperar/confirmar', async c => {
      const { desafio, codigo, contrasena } = await leerJson(c, esquemaConfirmarRecuperacion);
      const resultado = await servicio.confirmarRecuperacion(desafio, codigo, contrasena);
      if (resultado.tipo !== 'sesion') return codigoFallido(resultado.tipo, resultado.tipo === 'incorrecto' ? resultado.restantes : 0);
      escribirCookieSesion(c, resultado.token, resultado.expira, cookieSegura);
      const cuerpo: RespuestaLogin = { estado: 'sesion_iniciada', usuario: resultado.usuario };
      return c.json(cuerpo);
    })
    // Cuentas sin correo: usuario + cédula → contraseña temporal que se muestra una sola vez.
    .post('/recuperar/cedula', async c => {
      const { usuario, cedula } = await leerJson(c, esquemaRecuperarPorCedula);
      const resultado = await servicio.recuperarPorCedula(usuario, cedula);
      switch (resultado.tipo) {
        case 'invalido': throw new ErrorHttp(401, 'Usuario o cédula incorrectos. Si tu cuenta tiene correo, recupérala por correo.');
        case 'bloqueado': throw new ErrorHttp(423, `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${minutosRestantes(resultado.hasta)} min.`);
        case 'temporal': {
          const cuerpo: RespuestaRecuperacionCedula = { contrasena_temporal: resultado.contrasena };
          return c.json(cuerpo);
        }
      }
    })
    .post('/cambiar-contrasena', sesion, async c => {
      const { actual, nueva } = await leerJson(c, esquemaCambiarContrasena);
      const resultado = await servicio.cambiarContrasena(c.get('usuario').id, leerTokenSesion(c)!, actual, nueva);
      if (resultado.tipo === 'incorrecta') throw new ErrorHttp(400, 'La contraseña actual no es correcta');
      return c.json({ usuario: resultado.usuario });
    })
    .post('/logout', async c => {
      const token = leerTokenSesion(c);
      if (token) await servicio.cerrarSesion(token);
      borrarCookieSesion(c, cookieSegura);
      return c.body(null, 204);
    })
    .get('/sesion', sesion, c => c.json({ usuario: c.get('usuario') }));
}
