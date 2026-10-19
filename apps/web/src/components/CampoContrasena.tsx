import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

// Campo de contraseña con el estilo del login y botón para mostrarla u ocultarla.
const CampoContrasena: React.FC<{
  etiqueta: string; valor: string; onCambio: (valor: string) => void;
  autoComplete: 'current-password' | 'new-password'; autoFocus?: boolean;
}> = ({ etiqueta, valor, onCambio, autoComplete, autoFocus }) => {
  const [visible, setVisible] = useState(false);
  return (
    <label className="login-campo">
      <span>{etiqueta}</span>
      <div className="login-entrada">
        <Lock size={18} aria-hidden="true" />
        <input type={visible ? 'text' : 'password'} value={valor} onChange={e => onCambio(e.target.value)}
          autoComplete={autoComplete} autoFocus={autoFocus} required />
        <button type="button" className="login-icono-boton" onClick={() => setVisible(v => !v)}
          aria-label={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
};

export default CampoContrasena;
