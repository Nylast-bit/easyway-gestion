'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, MailCheck, User } from 'lucide-react';
import { LONGITUD_CODIGO_OTP, esquemaLogin, type RespuestaLogin } from '@easyway/shared';
import { ErrorApi, solicitarApi } from '../lib/api';
import RecuperarAcceso from '../components/RecuperarAcceso';

type Desafio = { desafio: string; correo: string; reintentarEn: number };

// Solo rutas internas: evita redirecciones abiertas a otros dominios.
function destinoSeguro() {
  const siguiente = new URLSearchParams(window.location.search).get('siguiente');
  return siguiente && siguiente.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/';
}

const Login: React.FC = () => {
  const router = useRouter();
  const [identificador, setIdentificador] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [desafio, setDesafio] = useState<Desafio | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = (respuesta: RespuestaLogin) => {
    if (respuesta.estado !== 'sesion_iniciada') return;
    toast.success(`Bienvenido, ${respuesta.usuario.nombre.split(' ')[0]}`);
    router.replace(destinoSeguro());
  };

  const iniciarSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validacion = esquemaLogin.safeParse({ identificador, contrasena });
    if (!validacion.success) return setError(validacion.error.issues[0].message);
    setEnviando(true);
    try {
      const respuesta = await solicitarApi<RespuestaLogin>('/auth/login', { cuerpo: validacion.data });
      if (respuesta.estado === 'verificacion_requerida') {
        setDesafio({ desafio: respuesta.desafio, correo: respuesta.correo, reintentarEn: respuesta.reintentarEn });
        setContrasena('');
      } else entrar(respuesta);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="login-pagina">
      <section className="login-tarjeta" aria-labelledby="login-titulo">
        <div className="login-marca">
          <span className="login-logo" aria-hidden="true">E</span>
          <span>Easyway GPS</span>
        </div>

        {recuperando ? (
          <RecuperarAcceso
            onVolver={() => { setRecuperando(false); setError(''); }}
            onSesion={entrar}
            onTemporal={(usuario, temporal) => { setIdentificador(usuario); setContrasena(temporal); setRecuperando(false); setError(''); }}
          />
        ) : desafio ? (
          <VerificacionCorreo
            desafio={desafio}
            onVolver={() => { setDesafio(null); setError(''); }}
            onVerificado={entrar}
          />
        ) : (
          <form onSubmit={iniciarSesion} noValidate>
            <h1 id="login-titulo">Iniciar sesión</h1>
            <p className="login-ayuda">Entra con tu usuario o tu correo electrónico.</p>

            <label className="login-campo">
              <span>Usuario o correo</span>
              <div className="login-entrada">
                <User size={18} aria-hidden="true" />
                <input
                  value={identificador}
                  onChange={e => setIdentificador(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                />
              </div>
            </label>

            <label className="login-campo">
              <span>Contraseña</span>
              <div className="login-entrada">
                <Lock size={18} aria-hidden="true" />
                <input
                  type={mostrarContrasena ? 'text' : 'password'}
                  value={contrasena}
                  onChange={e => setContrasena(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-icono-boton"
                  onClick={() => setMostrarContrasena(v => !v)}
                  aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {mostrarContrasena ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button type="submit" className="login-boton" disabled={enviando}>
              {enviando && <Loader2 size={18} className="girando" aria-hidden="true" />}
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
            <div className="login-acciones login-acciones-centro">
              <button type="button" className="login-enlace" onClick={() => { setRecuperando(true); setError(''); }}>¿Olvidaste tu contraseña?</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
};

function VerificacionCorreo({ desafio, onVolver, onVerificado }: {
  desafio: Desafio;
  onVolver: () => void;
  onVerificado: (respuesta: RespuestaLogin) => void;
}) {
  const [digitos, setDigitos] = useState<string[]>(Array(LONGITUD_CODIGO_OTP).fill(''));
  const [espera, setEspera] = useState(desafio.reintentarEn);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const casillas = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { casillas.current[0]?.focus(); }, []);
  useEffect(() => {
    if (espera <= 0) return;
    const temporizador = setTimeout(() => setEspera(s => s - 1), 1000);
    return () => clearTimeout(temporizador);
  }, [espera]);

  const verificar = async (codigo: string) => {
    setError('');
    setEnviando(true);
    try {
      onVerificado(await solicitarApi<RespuestaLogin>('/auth/verificar-correo', { cuerpo: { desafio: desafio.desafio, codigo } }));
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo verificar el código');
      setDigitos(Array(LONGITUD_CODIGO_OTP).fill(''));
      casillas.current[0]?.focus();
    } finally {
      setEnviando(false);
    }
  };

  const actualizar = (desde: number, valor: string) => {
    const nuevos = valor.replace(/\D/g, '').slice(0, LONGITUD_CODIGO_OTP - desde).split('');
    if (!nuevos.length) return;
    const siguiente = [...digitos];
    nuevos.forEach((d, i) => { siguiente[desde + i] = d; });
    setDigitos(siguiente);
    casillas.current[Math.min(desde + nuevos.length, LONGITUD_CODIGO_OTP - 1)]?.focus();
    if (siguiente.every(Boolean) && !enviando) void verificar(siguiente.join(''));
  };

  const teclaAbajo = (indice: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digitos[indice] && indice > 0) {
      const siguiente = [...digitos];
      siguiente[indice - 1] = '';
      setDigitos(siguiente);
      casillas.current[indice - 1]?.focus();
      e.preventDefault();
    }
  };

  const reenviar = async () => {
    setError('');
    try {
      const { reintentarEn } = await solicitarApi<{ reintentarEn: number }>('/auth/reenviar-codigo', { cuerpo: { desafio: desafio.desafio } });
      setEspera(reintentarEn);
      toast.success('Te enviamos un código nuevo');
    } catch (err) {
      const detalles = err instanceof ErrorApi ? err.detalles as { reintentarEn?: number } | undefined : undefined;
      if (detalles?.reintentarEn) setEspera(detalles.reintentarEn);
      setError(err instanceof ErrorApi ? err.message : 'No se pudo reenviar el código');
    }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); void verificar(digitos.join('')); }} noValidate>
      <div className="login-icono-correo" aria-hidden="true"><MailCheck size={28} /></div>
      <h1 id="login-titulo">Verifica tu correo</h1>
      <p className="login-ayuda">
        Enviamos un código de {LONGITUD_CODIGO_OTP} dígitos a <strong>{desafio.correo}</strong>. Solo se pide la primera vez.
      </p>

      <div className="otp-casillas" role="group" aria-label="Código de verificación">
        {digitos.map((digito, i) => (
          <input
            key={i}
            ref={el => { casillas.current[i] = el; }}
            value={digito}
            onChange={e => actualizar(i, e.target.value)}
            onKeyDown={e => teclaAbajo(i, e)}
            onPaste={e => { e.preventDefault(); actualizar(i, e.clipboardData.getData('text')); }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={LONGITUD_CODIGO_OTP}
            aria-label={`Dígito ${i + 1}`}
            disabled={enviando}
          />
        ))}
      </div>

      {error && <p className="login-error" role="alert">{error}</p>}

      <button type="submit" className="login-boton" disabled={enviando || !digitos.every(Boolean)}>
        {enviando && <Loader2 size={18} className="girando" aria-hidden="true" />}
        {enviando ? 'Verificando…' : 'Verificar'}
      </button>

      <div className="login-acciones">
        <button type="button" className="login-enlace" onClick={onVolver}>
          <ArrowLeft size={16} aria-hidden="true" /> Volver
        </button>
        <button type="button" className="login-enlace" onClick={reenviar} disabled={espera > 0}>
          {espera > 0 ? `Reenviar código en ${espera} s` : 'Reenviar código'}
        </button>
      </div>
    </form>
  );
}

export default Login;
