import { and, eq, gt, isNull, lt, lte, sql } from 'drizzle-orm';
import { LONGITUD_CODIGO_OTP, clasificarIdentificador, type UsuarioSesion } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { sesiones, usuarios, verificacionesCorreo } from '../db/esquema';
import type { EnviadorCorreo } from '../correo/enviador';
import { crearCorreoOtp } from '../correo/plantillaOtp';
import { generarCodigoOtp, generarToken, igualesSeguro, obtenerHashFicticio, sha256, verificarContrasena } from './criptografia';

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
const aSesion = (u: FilaUsuario): UsuarioSesion =>
  ({ id: u.id, nombre: u.nombre, usuario: u.usuario, correo: u.correo, rol: u.rol, tecnico_id: u.tecnico_id });

export type ResultadoLogin =
  | { tipo: 'invalido' }
  | { tipo: 'bloqueado'; hasta: Date }
  | { tipo: 'inactivo' }
  | { tipo: 'envio_fallido' }
  | { tipo: 'verificacion'; desafio: string; correo: string; reintentarEn: number }
  | { tipo: 'sesion'; token: string; expira: Date; usuario: UsuarioSesion };

export type ResultadoVerificacion =
  | { tipo: 'expirado' }
  | { tipo: 'agotado' }
  | { tipo: 'incorrecto'; restantes: number }
  | { tipo: 'sesion'; token: string; expira: Date; usuario: UsuarioSesion };

export type ResultadoReenvio =
  | { tipo: 'expirado' }
  | { tipo: 'espera'; segundos: number }
  | { tipo: 'limite' }
  | { tipo: 'envio_fallido' }
  | { tipo: 'enviado'; reintentarEn: number };

export function crearServicioAutenticacion(bd: BaseDatos, enviador: EnviadorCorreo, reloj: () => Date = () => new Date()) {
  async function crearSesion(ejecutor: Pick<BaseDatos, 'insert' | 'delete'>, usuario: FilaUsuario, ahora: Date) {
    const token = generarToken();
    const expira = minutos(ahora, POLITICA.horasSesion * 60);
    // Limpieza oportunista de sesiones caducadas del mismo usuario.
    await ejecutor.delete(sesiones).where(and(eq(sesiones.usuario_id, usuario.id), lte(sesiones.expira_at, ahora)));
    await ejecutor.insert(sesiones).values({ token_hash: sha256(token), usuario_id: usuario.id, expira_at: expira });
    return { tipo: 'sesion' as const, token, expira, usuario: aSesion(usuario) };
  }

  async function enviarCodigo(usuario: FilaUsuario, codigo: string) {
    try {
      await enviador.enviar(crearCorreoOtp({ para: usuario.correo!, nombre: usuario.nombre, codigo, minutos: POLITICA.minutosCodigo }));
      return true;
    } catch (error) {
      console.error('Fallo al enviar correo OTP:', (error as Error).message);
      return false;
    }
  }

  async function iniciarDesafio(usuario: FilaUsuario, ahora: Date): Promise<ResultadoLogin> {
    const desafio = generarToken();
    const desafioHash = sha256(desafio);
    const codigo = generarCodigoOtp(LONGITUD_CODIGO_OTP);
    // Un solo desafío pendiente por usuario: un login nuevo invalida códigos anteriores.
    await bd.delete(verificacionesCorreo).where(and(eq(verificacionesCorreo.usuario_id, usuario.id), isNull(verificacionesCorreo.usado_at)));
    const [fila] = await bd.insert(verificacionesCorreo).values({
      usuario_id: usuario.id, desafio_hash: desafioHash, codigo_hash: hashCodigo(desafioHash, codigo),
      expira_at: minutos(ahora, POLITICA.minutosCodigo), enviado_at: ahora,
    }).returning({ id: verificacionesCorreo.id });
    if (!await enviarCodigo(usuario, codigo)) {
      await bd.delete(verificacionesCorreo).where(eq(verificacionesCorreo.id, fila.id));
      return { tipo: 'envio_fallido' };
    }
    return { tipo: 'verificacion', desafio, correo: enmascararCorreo(usuario.correo!), reintentarEn: POLITICA.segundosEntreEnvios };
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

      if (!await verificarContrasena(contrasena, usuario.contrasena_hash)) {
        // Incremento atómico: intentos concurrentes no pueden saltarse el límite.
        const limite = POLITICA.intentosAntesDeBloqueo;
        const [fila] = await bd.update(usuarios).set({
          intentos_fallidos: sql`CASE WHEN ${usuarios.intentos_fallidos} + 1 >= ${limite} THEN 0 ELSE ${usuarios.intentos_fallidos} + 1 END`,
          bloqueado_hasta: sql`CASE WHEN ${usuarios.intentos_fallidos} + 1 >= ${limite} THEN ${minutos(ahora, POLITICA.minutosBloqueo).toISOString()}::timestamptz ELSE NULL END`,
        }).where(eq(usuarios.id, usuario.id)).returning({ bloqueado_hasta: usuarios.bloqueado_hasta });
        return fila?.bloqueado_hasta ? { tipo: 'bloqueado', hasta: fila.bloqueado_hasta } : { tipo: 'invalido' };
      }
      if (!usuario.activo) return { tipo: 'inactivo' };
      if (usuario.intentos_fallidos || usuario.bloqueado_hasta) {
        await bd.update(usuarios).set({ intentos_fallidos: 0, bloqueado_hasta: null }).where(eq(usuarios.id, usuario.id));
      }
      // Regla de negocio: toda cuenta con correo lo verifica una vez; las de solo usuario no.
      if (usuario.correo && !usuario.correo_verificado_at) return iniciarDesafio(usuario, ahora);
      return crearSesion(bd, usuario, ahora);
    },

    async verificarCorreo(desafio: string, codigo: string): Promise<ResultadoVerificacion> {
      const ahora = reloj();
      const desafioHash = sha256(desafio);
      // Reservar el intento antes de comparar: impide fuerza bruta en paralelo.
      const [fila] = await bd.update(verificacionesCorreo).set({ intentos: sql`${verificacionesCorreo.intentos} + 1` })
        .where(and(eq(verificacionesCorreo.desafio_hash, desafioHash), isNull(verificacionesCorreo.usado_at),
          gt(verificacionesCorreo.expira_at, ahora), lt(verificacionesCorreo.intentos, POLITICA.intentosCodigo)))
        .returning();
      if (!fila) {
        const [existente] = await bd.select({ intentos: verificacionesCorreo.intentos, expira_at: verificacionesCorreo.expira_at })
          .from(verificacionesCorreo).where(and(eq(verificacionesCorreo.desafio_hash, desafioHash), isNull(verificacionesCorreo.usado_at)));
        return existente && existente.expira_at > ahora ? { tipo: 'agotado' } : { tipo: 'expirado' };
      }
      if (!igualesSeguro(fila.codigo_hash, hashCodigo(desafioHash, codigo))) {
        const restantes = POLITICA.intentosCodigo - fila.intentos;
        return restantes > 0 ? { tipo: 'incorrecto', restantes } : { tipo: 'agotado' };
      }
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
      if (!await enviarCodigo(usuario, codigo)) return { tipo: 'envio_fallido' };
      return { tipo: 'enviado', reintentarEn: POLITICA.segundosEntreEnvios };
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
