import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, Loader2 } from 'lucide-react';
import { esquemaCambiarContrasena, LONGITUD_MINIMA_CONTRASENA, type UsuarioSesion } from '@easyway/shared';
import { ErrorApi, solicitarApi } from '../lib/api';
import CampoContrasena from './CampoContrasena';

// Cambio de contraseña. Obligatorio tras entrar con una contraseña temporal o puesta por un administrador.
const CambiarContrasena: React.FC<{ usuario: UsuarioSesion; onCambiada: (usuario: UsuarioSesion) => void; onSalir: () => void }> =
  ({ usuario, onCambiada, onSalir }) => {
    const [actual, setActual] = useState('');
    const [nueva, setNueva] = useState('');
    const [confirmacion, setConfirmacion] = useState('');
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);

    const guardar = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      const validacion = esquemaCambiarContrasena.safeParse({ actual, nueva });
      if (!validacion.success) return setError(validacion.error.issues[0].message);
      if (nueva !== confirmacion) return setError('Las contraseñas nuevas no coinciden');
      setEnviando(true);
      try {
        const respuesta = await solicitarApi<{ usuario: UsuarioSesion }>('/auth/cambiar-contrasena', { cuerpo: validacion.data });
        toast.success('Contraseña actualizada');
        onCambiada(respuesta.usuario);
      } catch (err) {
        setError(err instanceof ErrorApi ? err.message : 'No se pudo cambiar la contraseña');
      } finally {
        setEnviando(false);
      }
    };

    return (
      <form onSubmit={guardar} noValidate>
        <div className="login-icono-correo" aria-hidden="true"><KeyRound size={28} /></div>
        <h1 id="login-titulo">Crea tu contraseña</h1>
        <p className="login-ayuda">
          Hola, <strong>{usuario.nombre.split(' ')[0]}</strong>. Entraste con una contraseña temporal o asignada por un administrador:
          elige una nueva para continuar (mínimo {LONGITUD_MINIMA_CONTRASENA} caracteres).
        </p>
        <CampoContrasena etiqueta="Contraseña actual" valor={actual} onCambio={setActual} autoComplete="current-password" autoFocus />
        <CampoContrasena etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} autoComplete="new-password" />
        <CampoContrasena etiqueta="Repite la contraseña nueva" valor={confirmacion} onCambio={setConfirmacion} autoComplete="new-password" />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="login-boton" disabled={enviando}>
          {enviando && <Loader2 size={18} className="girando" aria-hidden="true" />}
          {enviando ? 'Guardando…' : 'Guardar y continuar'}
        </button>
        <div className="login-acciones">
          <button type="button" className="login-enlace" onClick={onSalir}>Cerrar sesión</button>
        </div>
      </form>
    );
  };

export default CambiarContrasena;
