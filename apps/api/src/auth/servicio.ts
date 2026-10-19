import { and, count, eq, gt, isNull, lt, lte, max, ne, sql } from 'drizzle-orm';
import { LONGITUD_CODIGO_OTP, clasificarIdentificador, type UsuarioSesion } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { sesiones, usuarios, verificacionesCorreo } from '../db/esquema';
import type { EnviadorCorreo } from '../correo/enviador';
import { crearCorreoOtp, type PropositoCodigo } from '../correo/plantillaOtp';
import { registrarAuditoria } from '../negocio/auditoria';
import {
  generarCodigoOtp, generarContrasenaTemporal, generarToken, hashearContrasena, igualesSeguro,
  obtenerHashFicticio, sha256, verificarContrasena,
} from './criptografia';

export const POLITICA = {
  intentosAntesDeBloqueo: 5,
  minutosBloqueo: 15,
  horasSesion: 12,
  minutosCodigo: 10,
  intentosCodigo: 5,
  segundosEntreEnvios: 60,
  enviosMaximos: 5,
  horasDesafio: 1,
};

const minutos = (fecha: Date, cantidad: number) => new Date(fecha.getTime() + cantidad * 60_000);
const hashCodigo = (desafioHash: string, codigo: string) => sha256(`${desafioHash}:${codigo}`);

export function enmascararCorreo(correo: string) {
  const [local, dominio] = correo.split('@');
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 1))}@${dominio}`;
}

type FilaUsuario = typeof usuarios.$inferSelect;
const aSesion = (u: FilaUsuario): UsuarioSesion => ({
  id: u.id, nombre: u.nombre, usuario: u.usuario, correo: u.correo, rol: u.rol, tecnico_id: u.tecnico_id,
  debe_cambiar_contrasena: u.debe_cambiar_contrasena,
});

type Sesion = { tipo: 'sesion'; token: string; expira: Date; usuario: UsuarioSesion };
type Desafio = { tipo: 'verificacion'; desafio: string; correo: string; reintentarEn: number };

export type ResultadoLogin =
  | { tipo: 'invalido' }
  | { tipo: 'bloqueado'; hasta: Date }
  | { tipo: 'inactivo' }
  | { tipo: 'envio_fallido' }
  | Desafio
  | Sesion;

export type ResultadoVerificacion =
  | { tipo: 'expirado' }
  | { tipo: 'agotado' }
  | { tipo: 'incorrecto'; restantes: number }
  | Sesion;

export type ResultadoReenvio =
  | { tipo: 'expirado' }
  | { tipo: 'espera'; segundos: number }
  | { tipo: 'limite' }
  | { tipo: 'envio_fallido' }
  | { tipo: 'enviado'; reintentarEn: number };

export type ResultadoSolicitudRecuperacion =
  | { tipo: 'espera'; segundos: number }
  | { tipo: 'limite' }
  | { tipo: 'envio_fallido' }
  | Desafio;

export type ResultadoRecuperacionCedula =
  | { tipo: 'invalido' }
  | { tipo: 'bloqueado'; hasta: Date }
  | { tipo: 'temporal'; contrasena: string };

export type ResultadoCambioContrasena = { tipo: 'incorrecta' } | { tipo: 'cambiada'; usuario: UsuarioSesion };

export function crearServicioAutenticacion(bd: BaseDatos, enviador: EnviadorCorreo, reloj: () => Date = () => new Date()) {
  async function crearSesion(ejecutor: Pick<BaseDatos, 'insert' | 'delete'>, usuario: FilaUsuario, ahora: Date): Promise<Sesion> {
    const token = generarToken();
    const expira = minutos(ahora, POLITICA.horasSesion * 60);
    // Limpieza oportunista de sesiones caducadas del mismo usuario.
    await ejecutor.delete(sesiones).where(and(eq(sesiones.usuario_id, usuario.id), lte(sesiones.expira_at, ahora)));
    await ejecutor.insert(sesiones).values({ token_hash: sha256(token), usuario_id: usuario.id, expira_at: expira });
    return { tipo: 'sesion', token, expira, usuario: aSesion(usuario) };
  }

  // Incremento atómico: intentos concurrentes no pueden saltarse el límite. Lo comparten contraseña y cédula.
  async function registrarFallo(usuario: FilaUsuario, ahora: Date) {
    const limite = POLITICA.intentosAntesDeBloqueo;
    const [fila] = await bd.update(usuarios).set({
      intentos_fallidos: sql`CASE WHEN ${usuarios.intentos_fallidos} + 1 >= ${limite} THEN 0 ELSE ${usuarios.intentos_fallidos} + 1 END`,
      bloqueado_hasta: sql`CASE WHEN ${usuarios.intentos_fallidos} + 1 >= ${limite} THEN ${minutos(ahora, POLITICA.minutosBloqueo).toISOString()}::timestamptz ELSE NULL END`,
    }).where(eq(usuarios.id, usuario.id)).returning({ bloqueado_hasta: usuarios.bloqueado_hasta });
    return fila?.bloqueado_hasta ? { tipo: 'bloqueado' as const, hasta: fila.bloqueado_hasta } : { tipo: 'invalido' as const };
  }

  async function enviarCodigo(usuario: FilaUsuario, codigo: string, proposito: PropositoCodigo) {
    try {
      await enviador.enviar(crearCorreoOtp({ para: usuario.correo!, nombre: usuario.nombre, codigo, minutos: POLITICA.minutosCodigo, proposito }));
      return true;
    } catch (error) {
      console.error('Fallo al enviar correo OTP:', (error as Error).message);
      return false;
    }
  }

  async function iniciarDesafio(usuario: FilaUsuario, ahora: Date, proposito: PropositoCodigo): Promise<Desafio | { tipo: 'envio_fallido' }> {
    const desafio = generarToken();
    const desafioHash = sha256(desafio);
    const codigo = generarCodigoOtp(LONGITUD_CODIGO_OTP);
    // Un solo desafío pendiente por usuario y propósito: uno nuevo invalida los códigos anteriores.
    await bd.delete(verificacionesCorreo).where(and(eq(verificacionesCorreo.usuario_id, usuario.id),
      eq(verificacionesCorreo.proposito, proposito), isNull(verificacionesCorreo.usado_at)));
    const [fila] = await bd.insert(verificacionesCorreo).values({
      usuario_id: usuario.id, desafio_hash: desafioHash, codigo_hash: hashCodigo(desafioHash, codigo),
      expira_at: minutos(ahora, POLITICA.minutosCodigo), enviado_at: ahora, proposito,
    }).returning({ id: verificacionesCorreo.id });
    if (!await enviarCodigo(usuario, codigo, proposito)) {
      await bd.delete(verificacionesCorreo).where(eq(verificacionesCorreo.id, fila.id));
      return { tipo: 'envio_fallido' };
    }
    return { tipo: 'verificacion', desafio, correo: enmascararCorreo(usuario.correo!), reintentarEn: POLITICA.segundosEntreEnvios };
  }

  // Reserva el intento antes de comparar (impide fuerza bruta en paralelo) y comprueba el código.
  async function comprobarCodigo(desafio: string, codigo: string, proposito: PropositoCodigo, ahora: Date) {
    const desafioHash = sha256(desafio);
    const [fila] = await bd.update(verificacionesCorreo).set({ intentos: sql`${verificacionesCorreo.intentos} + 1` })
      .where(and(eq(verificacionesCorreo.desafio_hash, desafioHash), eq(verificacionesCorreo.proposito, proposito),
        isNull(verificacionesCorreo.usado_at), gt(verificacionesCorreo.expira_at, ahora), lt(verificacionesCorreo.intentos, POLITICA.intentosCodigo)))
      .returning();
    if (!fila) {
      const [existente] = await bd.select({ expira_at: verificacionesCorreo.expira_at }).from(verificacionesCorreo)
        .where(and(eq(verificacionesCorreo.desafio_hash, desafioHash), eq(verificacionesCorreo.proposito, proposito), isNull(verificacionesCorreo.usado_at)));
      return existente && existente.expira_at > ahora ? { tipo: 'agotado' as const } : { tipo: 'expirado' as const };
    }
    if (!igualesSeguro(fila.codigo_hash, hashCodigo(desafioHash, codigo))) {
      const restantes = POLITICA.intentosCodigo - fila.intentos;
      return restantes > 0 ? { tipo: 'incorrecto' as const, restantes } : { tipo: 'agotado' as const };
    }
    return { tipo: 'valido' as const, fila };
  }

  return {
    async iniciarSesion(identificador: string, contrasena: string): Promise<ResultadoLogin> {
      const ahora = reloj();
      const id = clasificarIdentificador(identificador);
      const [usuario] = id ? await bd.select().from(usuarios)
        .where(id.tipo === 'correo' ? eq(usuarios.correo, id.valor) : eq(usuarios.usuario, id.valor)).limit(1) : [];
      if (!usuario) {
        await verificarContrasena(contrasena, await obtenerHashFicticio());
        return { tipo: 'invalido' };
      }
      if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > ahora) return { tipo: 'bloqueado', hasta: usuario.bloqueado_hasta };

      if (!await verificarContrasena(contrasena, usuario.contrasena_hash)) return registrarFallo(usuario, ahora);
      if (!usuario.activo) return { tipo: 'inactivo' };
      if (usuario.intentos_fallidos || usuario.bloqueado_hasta) {
        await bd.update(usuarios).set({ intentos_fallidos: 0, bloqueado_hasta: null }).where(eq(usuarios.id, usuario.id));
      }
      // Regla de negocio: toda cuenta con correo lo verifica una vez; las de solo usuario no.
      if (usuario.correo && !usuario.correo_verificado_at) return iniciarDesafio(usuario, ahora, 'verificar');
      return crearSesion(bd, usuario, ahora);
    },

    async verificarCorreo(desafio: string, codigo: string): Promise<ResultadoVerificacion> {
      const ahora = reloj();
      const comprobado = await comprobarCodigo(desafio, codigo, 'verificar', ahora);
      if (comprobado.tipo !== 'valido') return comprobado;
      const { fila } = comprobado;
      return bd.transaction(async tx => {
        const [usada] = await tx.update(verificacionesCorreo).set({ usado_at: ahora })
          .where(and(eq(verificacionesCorreo.id, fila.id), isNull(verificacionesCorreo.usado_at))).returning({ id: verificacionesCorreo.id });
        if (!usada) return { tipo: 'expirado' as const };
        const [usuario] = await tx.update(usuarios).set({ correo_verificado_at: ahora })
          .where(and(eq(usuarios.id, fila.usuario_id), eq(usuarios.activo, true))).returning();
        if (!usuario) return { tipo: 'expirado' as const };
        return crearSesion(tx, usuario, ahora);
      });
    },

    async reenviarCodigo(desafio: string): Promise<ResultadoReenvio> {
      const ahora = reloj();
      const desafioHash = sha256(desafio);
      const [fila] = await bd.select().from(verificacionesCorreo)
        .where(and(eq(verificacionesCorreo.desafio_hash, desafioHash), isNull(verificacionesCorreo.usado_at)));
      if (!fila || minutos(fila.created_at, POLITICA.horasDesafio * 60) <= ahora) return { tipo: 'expirado' };
      if (fila.envios >= POLITICA.enviosMaximos) return { tipo: 'limite' };
      const disponible = new Date(fila.enviado_at.getTime() + POLITICA.segundosEntreEnvios * 1000);
      if (disponible > ahora) return { tipo: 'espera', segundos: Math.ceil((disponible.getTime() - ahora.getTime()) / 1000) };

      const codigo = generarCodigoOtp(LONGITUD_CODIGO_OTP);
      const limiteEnvio = new Date(ahora.getTime() - POLITICA.segundosEntreEnvios * 1000);
      // Condición repetida en el UPDATE para que dos reenvíos simultáneos no envíen dos correos.
      const [actualizada] = await bd.update(verificacionesCorreo).set({
        codigo_hash: hashCodigo(desafioHash, codigo), expira_at: minutos(ahora, POLITICA.minutosCodigo),
        intentos: 0, envios: sql`${verificacionesCorreo.envios} + 1`, enviado_at: ahora,
      }).where(and(eq(verificacionesCorreo.id, fila.id), isNull(verificacionesCorreo.usado_at),
        lte(verificacionesCorreo.enviado_at, limiteEnvio), lt(verificacionesCorreo.envios, POLITICA.enviosMaximos)))
        .returning({ id: verificacionesCorreo.id });
      if (!actualizada) return { tipo: 'espera', segundos: POLITICA.segundosEntreEnvios };
      const [usuario] = await bd.select().from(usuarios).where(eq(usuarios.id, fila.usuario_id));
      if (!usuario?.activo || !usuario.correo) return { tipo: 'expirado' };
      if (!await enviarCodigo(usuario, codigo, fila.proposito as PropositoCodigo)) return { tipo: 'envio_fallido' };
      return { tipo: 'enviado', reintentarEn: POLITICA.segundosEntreEnvios };
    },

    // Contraseña olvidada (cuentas con correo). Si el correo no corresponde a una cuenta activa se responde
    // igual con un desafío inservible: la pantalla no revela qué correos están registrados.
    async solicitarRecuperacion(correo: string): Promise<ResultadoSolicitudRecuperacion> {
      const ahora = reloj();
      const [usuario] = await bd.select().from(usuarios).where(and(eq(usuarios.correo, correo), eq(usuarios.activo, true))).limit(1);
      if (!usuario) return { tipo: 'verificacion', desafio: generarToken(), correo: enmascararCorreo(correo), reintentarEn: POLITICA.segundosEntreEnvios };
      // Límite de correos por cuenta: uno por minuto y como máximo enviosMaximos por hora.
      const [recientes] = await bd.select({ total: count(), ultimo: max(verificacionesCorreo.enviado_at) }).from(verificacionesCorreo)
        .where(and(eq(verificacionesCorreo.usuario_id, usuario.id), eq(verificacionesCorreo.proposito, 'recuperar'),
          gt(verificacionesCorreo.created_at, minutos(ahora, -POLITICA.horasDesafio * 60))));
      const disponible = recientes?.ultimo ? new Date(recientes.ultimo.getTime() + POLITICA.segundosEntreEnvios * 1000) : ahora;
      if (disponible > ahora) return { tipo: 'espera', segundos: Math.ceil((disponible.getTime() - ahora.getTime()) / 1000) };
      if ((recientes?.total ?? 0) >= POLITICA.enviosMaximos) return { tipo: 'limite' };
      // Los desafíos anteriores se marcan como usados (no se borran) para que cuenten en el límite por hora.
      await bd.update(verificacionesCorreo).set({ usado_at: ahora }).where(and(eq(verificacionesCorreo.usuario_id, usuario.id),
        eq(verificacionesCorreo.proposito, 'recuperar'), isNull(verificacionesCorreo.usado_at)));
      const desafio = generarToken();
      const desafioHash = sha256(desafio);
      const codigo = generarCodigoOtp(LONGITUD_CODIGO_OTP);
      await bd.insert(verificacionesCorreo).values({
        usuario_id: usuario.id, desafio_hash: desafioHash, codigo_hash: hashCodigo(desafioHash, codigo),
        expira_at: minutos(ahora, POLITICA.minutosCodigo), enviado_at: ahora, proposito: 'recuperar',
      });
      if (!await enviarCodigo(usuario, codigo, 'recuperar')) return { tipo: 'envio_fallido' };
      return { tipo: 'verificacion', desafio, correo: enmascararCorreo(correo), reintentarEn: POLITICA.segundosEntreEnvios };
    },

    // Código correcto: contraseña nueva, desbloqueo, correo verificado, cierre de todas las sesiones y sesión nueva.
    async confirmarRecuperacion(desafio: string, codigo: string, contrasena: string): Promise<ResultadoVerificacion> {
      const ahora = reloj();
      const comprobado = await comprobarCodigo(desafio, codigo, 'recuperar', ahora);
      if (comprobado.tipo !== 'valido') return comprobado;
      const { fila } = comprobado;
      const hash = await hashearContrasena(contrasena);
      return bd.transaction(async tx => {
        const [usada] = await tx.update(verificacionesCorreo).set({ usado_at: ahora })
          .where(and(eq(verificacionesCorreo.id, fila.id), isNull(verificacionesCorreo.usado_at))).returning({ id: verificacionesCorreo.id });
        if (!usada) return { tipo: 'expirado' as const };
        const [usuario] = await tx.update(usuarios).set({
          contrasena_hash: hash, debe_cambiar_contrasena: false, intentos_fallidos: 0, bloqueado_hasta: null,
          correo_verificado_at: sql`COALESCE(${usuarios.correo_verificado_at}, ${ahora.toISOString()}::timestamptz)`,
        }).where(and(eq(usuarios.id, fila.usuario_id), eq(usuarios.activo, true))).returning();
        if (!usuario) return { tipo: 'expirado' as const };
        await tx.delete(sesiones).where(eq(sesiones.usuario_id, usuario.id));
        await registrarAuditoria(tx, usuario, 'recuperar_por_correo', 'usuarios', usuario.id);
        return crearSesion(tx, usuario, ahora);
      });
    },

    // Cuentas sin correo: usuario + cédula registrada. Asigna una contraseña temporal que se cambia al entrar.
    // Los fallos cuentan en el mismo bloqueo que la contraseña y el mensaje no distingue la causa.
    async recuperarPorCedula(nombreUsuario: string, cedula: string): Promise<ResultadoRecuperacionCedula> {
      const ahora = reloj();
      const [usuario] = await bd.select().from(usuarios).where(eq(usuarios.usuario, nombreUsuario)).limit(1);
      if (!usuario) return { tipo: 'invalido' };
      if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > ahora) return { tipo: 'bloqueado', hasta: usuario.bloqueado_hasta };
      const coincide = usuario.activo && !usuario.correo && usuario.cedula !== null && igualesSeguro(usuario.cedula, cedula);
      if (!coincide) return registrarFallo(usuario, ahora);

      const temporal = generarContrasenaTemporal();
      const hash = await hashearContrasena(temporal);
      await bd.transaction(async tx => {
        await tx.update(usuarios).set({ contrasena_hash: hash, debe_cambiar_contrasena: true, intentos_fallidos: 0, bloqueado_hasta: null })
          .where(eq(usuarios.id, usuario.id));
        await tx.delete(sesiones).where(eq(sesiones.usuario_id, usuario.id));
        await registrarAuditoria(tx, usuario, 'recuperar_por_cedula', 'usuarios', usuario.id);
      });
      return { tipo: 'temporal', contrasena: temporal };
    },

    // Cambio por el propio usuario: exige la actual y cierra sus otras sesiones (conserva la actual).
    async cambiarContrasena(usuarioId: number, token: string, actual: string, nueva: string): Promise<ResultadoCambioContrasena> {
      const [usuario] = await bd.select().from(usuarios).where(eq(usuarios.id, usuarioId));
      if (!usuario || !await verificarContrasena(actual, usuario.contrasena_hash)) return { tipo: 'incorrecta' };
      const hash = await hashearContrasena(nueva);
      return bd.transaction(async tx => {
        const [cambiado] = await tx.update(usuarios).set({ contrasena_hash: hash, debe_cambiar_contrasena: false })
          .where(eq(usuarios.id, usuarioId)).returning();
        await tx.delete(sesiones).where(and(eq(sesiones.usuario_id, usuarioId), ne(sesiones.token_hash, sha256(token))));
        await registrarAuditoria(tx, cambiado, 'cambiar_contrasena', 'usuarios', usuarioId);
        return { tipo: 'cambiada' as const, usuario: aSesion(cambiado) };
      });
    },

    async obtenerSesion(token: string): Promise<UsuarioSesion | null> {
      const [fila] = await bd.select({ usuario: usuarios }).from(sesiones)
        .innerJoin(usuarios, eq(usuarios.id, sesiones.usuario_id))
        .where(and(eq(sesiones.token_hash, sha256(token)), gt(sesiones.expira_at, reloj()), eq(usuarios.activo, true)));
      return fila ? aSesion(fila.usuario) : null;
    },

    async cerrarSesion(token: string) {
      await bd.delete(sesiones).where(eq(sesiones.token_hash, sha256(token)));
    },
  };
}

export type ServicioAutenticacion = ReturnType<typeof crearServicioAutenticacion>;
