import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, IdCard, KeyRound, Loader2, Mail, User } from 'lucide-react';
import {
  LONGITUD_CODIGO_OTP, esquemaConfirmarRecuperacion, esquemaRecuperarPorCedula, esquemaRecuperarPorCorreo,
  type RespuestaLogin, type RespuestaRecuperacion, type RespuestaRecuperacionCedula,
} from '@easyway/shared';
import { ErrorApi, solicitarApi } from '../lib/api';
import CampoContrasena from './CampoContrasena';

type Via = 'correo' | 'cedula';
const mensaje = (err: unknown, alternativo: string) => (err instanceof ErrorApi ? err.message : alternativo);

// Contraseña olvidada: con correo se envía un código; sin correo se valida la cédula registrada
// y se entrega una contraseña temporal que se cambia al entrar.
const RecuperarAcceso: React.FC<{
  onVolver: () => void;
  onSesion: (respuesta: RespuestaLogin) => void;
  onTemporal: (usuario: string, contrasena: string) => void;
}> = ({ onVolver, onSesion, onTemporal }) => {
  const [via, setVia] = useState<Via>('correo');
  return (
    <div className="recuperar">
      <h1 id="login-titulo">Recuperar acceso</h1>
      <div className="login-pestanas" role="group" aria-label="Cómo recuperar el acceso">
        <button type="button" aria-pressed={via === 'correo'} onClick={() => setVia('correo')}><Mail size={16} aria-hidden="true" /> Con correo</button>
        <button type="button" aria-pressed={via === 'cedula'} onClick={() => setVia('cedula')}><IdCard size={16} aria-hidden="true" /> Sin correo</button>
      </div>
      {via === 'correo' ? <PorCorreo onSesion={onSesion} /> : <PorCedula onTemporal={onTemporal} />}
      <div className="login-acciones">
        <button type="button" className="login-enlace" onClick={onVolver}><ArrowLeft size={16} aria-hidden="true" /> Volver a iniciar sesión</button>
      </div>
    </div>
  );
};

function PorCorreo({ onSesion }: { onSesion: (respuesta: RespuestaLogin) => void }) {
  const [correo, setCorreo] = useState('');
  const [desafio, setDesafio] = useState<RespuestaRecuperacion | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [espera, setEspera] = useState(0);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const temporizador = setTimeout(() => setEspera(s => s - 1), 1000);
    return () => clearTimeout(temporizador);
  }, [espera]);

  const pedir = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validacion = esquemaRecuperarPorCorreo.safeParse({ correo });
    if (!validacion.success) return setError(validacion.error.issues[0].message);
    setEnviando(true);
    try {
      const respuesta = await solicitarApi<RespuestaRecuperacion>('/auth/recuperar', { cuerpo: validacion.data });
      setDesafio(respuesta);
      setEspera(respuesta.reintentarEn);
    } catch (err) { setError(mensaje(err, 'No se pudo enviar el código')); }
    finally { setEnviando(false); }
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desafio) return;
    setError('');
    const validacion = esquemaConfirmarRecuperacion.safeParse({ desafio: desafio.desafio, codigo, contrasena: nueva });
    if (!validacion.success) return setError(validacion.error.issues[0].message);
    if (nueva !== confirmacion) return setError('Las contraseñas nuevas no coinciden');
    setEnviando(true);
    try {
      const respuesta = await solicitarApi<RespuestaLogin>('/auth/recuperar/confirmar', { cuerpo: validacion.data });
      toast.success('Contraseña restablecida');
      onSesion(respuesta);
    } catch (err) { setError(mensaje(err, 'No se pudo restablecer la contraseña')); }
    finally { setEnviando(false); }
  };

  const reenviar = async () => {
    if (!desafio) return;
    setError('');
    try {
      const { reintentarEn } = await solicitarApi<{ reintentarEn: number }>('/auth/reenviar-codigo', { cuerpo: { desafio: desafio.desafio } });
      setEspera(reintentarEn);
      toast.success('Te enviamos un código nuevo');
    } catch (err) {
      const detalles = err instanceof ErrorApi ? err.detalles as { reintentarEn?: number } | undefined : undefined;
      if (detalles?.reintentarEn) setEspera(detalles.reintentarEn);
      setError(mensaje(err, 'No se pudo reenviar el código'));
    }
  };

  if (!desafio) return (
    <form onSubmit={pedir} noValidate>
      <p className="login-ayuda">Te enviaremos un código de {LONGITUD_CODIGO_OTP} dígitos para que elijas una contraseña nueva.</p>
      <label className="login-campo">
        <span>Correo de tu cuenta</span>
        <div className="login-entrada">
          <Mail size={18} aria-hidden="true" />
          <input type="email" value={correo} onChange={e => setCorreo(e.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus required />
        </div>
      </label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" className="login-boton" disabled={enviando}>
        {enviando && <Loader2 size={18} className="girando" aria-hidden="true" />}
        {enviando ? 'Enviando…' : 'Enviar código'}
      </button>
    </form>
  );

  return (
    <form onSubmit={confirmar} noValidate>
      <p className="login-ayuda">
        Si <strong>{desafio.correo}</strong> pertenece a una cuenta, recibirás un código en unos segundos. Revisa también el correo no deseado.
      </p>
      <label className="login-campo">
        <span>Código de {LONGITUD_CODIGO_OTP} dígitos</span>
        <div className="login-entrada">
          <KeyRound size={18} aria-hidden="true" />
          <input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, LONGITUD_CODIGO_OTP))}
            inputMode="numeric" autoComplete="one-time-code" autoFocus required />
        </div>
      </label>
      <CampoContrasena etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} autoComplete="new-password" />
      <CampoContrasena etiqueta="Repite la contraseña nueva" valor={confirmacion} onCambio={setConfirmacion} autoComplete="new-password" />
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" className="login-boton" disabled={enviando}>
        {enviando && <Loader2 size={18} className="girando" aria-hidden="true" />}
        {enviando ? 'Guardando…' : 'Restablecer y entrar'}
      </button>
      <div className="login-acciones">
        <button type="button" className="login-enlace" onClick={() => { setDesafio(null); setCodigo(''); setError(''); }}>Usar otro correo</button>
        <button type="button" className="login-enlace" onClick={reenviar} disabled={espera > 0}>
          {espera > 0 ? `Reenviar código en ${espera} s` : 'Reenviar código'}
        </button>
      </div>
    </form>
  );
}

function PorCedula({ onTemporal }: { onTemporal: (usuario: string, contrasena: string) => void }) {
  const [usuario, setUsuario] = useState('');
  const [cedula, setCedula] = useState('');
  const [temporal, setTemporal] = useState<{ usuario: string; contrasena: string } | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const validar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validacion = esquemaRecuperarPorCedula.safeParse({ usuario, cedula });
    if (!validacion.success) return setError(validacion.error.issues[0].message);
    setEnviando(true);
    try {
      const respuesta = await solicitarApi<RespuestaRecuperacionCedula>('/auth/recuperar/cedula', { cuerpo: validacion.data });
      setTemporal({ usuario: validacion.data.usuario, contrasena: respuesta.contrasena_temporal });
    } catch (err) { setError(mensaje(err, 'No se pudo validar la cédula')); }
    finally { setEnviando(false); }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(temporal!.contrasena); toast.success('Contraseña copiada'); }
    catch { toast.error('No se pudo copiar; escríbela a mano'); }
  };

  if (temporal) return (
    <div className="recuperar-temporal">
      <p className="login-ayuda">Cédula verificada. Esta es tu contraseña temporal; solo se muestra una vez. Al entrar te pediremos crear una nueva.</p>
      <div className="contrasena-temporal">
        <code aria-label="Contraseña temporal">{temporal.contrasena}</code>
        <button type="button" className="login-icono-boton" onClick={copiar} aria-label="Copiar contraseña temporal" title="Copiar"><Copy size={18} /></button>
      </div>
      <button type="button" className="login-boton" onClick={() => onTemporal(temporal.usuario, temporal.contrasena)}>Iniciar sesión con ella</button>
    </div>
  );

  return (
    <form onSubmit={validar} noValidate>
      <p className="login-ayuda">Para cuentas sin correo: escribe tu usuario y la cédula registrada en tu cuenta.</p>
      <label className="login-campo">
        <span>Usuario</span>
        <div className="login-entrada">
          <User size={18} aria-hidden="true" />
          <input value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required />
        </div>
      </label>
      <label className="login-campo">
        <span>Cédula</span>
        <div className="login-entrada">
          <IdCard size={18} aria-hidden="true" />
          <input value={cedula} onChange={e => setCedula(e.target.value)} inputMode="numeric" placeholder="000-0000000-0" autoComplete="off" required />
        </div>
      </label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" className="login-boton" disabled={enviando}>
        {enviando && <Loader2 size={18} className="girando" aria-hidden="true" />}
        {enviando ? 'Validando…' : 'Validar cédula'}
      </button>
    </form>
  );
}

export default RecuperarAcceso;
