import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { LONGITUD_MINIMA_CONTRASENA, type Persona, type UsuarioFila } from '@easyway/shared';

export type DatosFormularioUsuario = {
  nombre: string; usuario: string; correo: string; contrasena: string;
  rol: 'admin' | 'tecnico'; tecnico_id: string | number; activo: boolean;
};

interface UsuarioFormProps {
  onSubmit: (datos: DatosFormularioUsuario) => void;
  initialValues?: UsuarioFila;
  fichas: Persona[];
  // Fichas ya vinculadas a otra cuenta (una ficha = una cuenta).
  fichasOcupadas: number[];
  esPropia: boolean;
}

// Alta y edición de cuentas. Usuario y correo solo se fijan al crear: son identificadores de acceso.
const UsuarioForm: React.FC<UsuarioFormProps> = ({ onSubmit, initialValues, fichas, fichasOcupadas, esPropia }) => {
  const [datos, setDatos] = useState<DatosFormularioUsuario>({
    nombre: initialValues?.nombre ?? '',
    usuario: initialValues?.usuario ?? '',
    correo: initialValues?.correo ?? '',
    contrasena: '',
    rol: initialValues?.rol ?? 'tecnico',
    tecnico_id: initialValues?.tecnico_id ?? '',
    activo: initialValues?.activo ?? true,
  });
  const [verContrasena, setVerContrasena] = useState(false);
  const cambiar = <K extends keyof DatosFormularioUsuario>(campo: K, valor: DatosFormularioUsuario[K]) => setDatos(d => ({ ...d, [campo]: valor }));
  const editando = Boolean(initialValues);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(datos); }}>
      <div className="form-group">
        <label className="form-label" htmlFor="usr-nombre">Nombre completo *</label>
        <input id="usr-nombre" className="form-input" value={datos.nombre} onChange={e => cambiar('nombre', e.target.value)} maxLength={120} required />
      </div>

      {editando ? (
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
          Acceso: {[initialValues?.usuario && `usuario ${initialValues.usuario}`, initialValues?.correo].filter(Boolean).join(' · ')}
        </p>
      ) : (
        <>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="usr-usuario">Usuario</label>
              <input id="usr-usuario" className="form-input" value={datos.usuario} autoCapitalize="none" spellCheck={false}
                onChange={e => cambiar('usuario', e.target.value.toLowerCase())} maxLength={40} placeholder="p. ej. pedro.martinez" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="usr-correo">Correo</label>
              <input id="usr-correo" type="email" className="form-input" value={datos.correo}
                onChange={e => cambiar('correo', e.target.value)} maxLength={254} />
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '-0.5rem 0 1rem' }}>
            Indica usuario, correo o ambos. Si tiene correo, la primera vez deberá confirmarlo con un código enviado a ese correo.
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="usr-contrasena">Contraseña inicial *</label>
            <div className="login-entrada">
              <input id="usr-contrasena" type={verContrasena ? 'text' : 'password'} value={datos.contrasena} autoComplete="new-password"
                onChange={e => cambiar('contrasena', e.target.value)} minLength={LONGITUD_MINIMA_CONTRASENA} required />
              <button type="button" className="login-icono-boton" onClick={() => setVerContrasena(v => !v)}
                aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {verContrasena ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <small style={{ color: '#6b7280' }}>Mínimo {LONGITUD_MINIMA_CONTRASENA} caracteres. Compártela por un canal privado.</small>
          </div>
        </>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="usr-rol">Rol</label>
          <select id="usr-rol" className="form-select" value={datos.rol} disabled={esPropia}
            onChange={e => { const rol = e.target.value as DatosFormularioUsuario['rol']; setDatos(d => ({ ...d, rol, tecnico_id: rol === 'admin' ? '' : d.tecnico_id })); }}>
            <option value="tecnico">Técnico</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        {datos.rol === 'tecnico' && (
          <div className="form-group">
            <label className="form-label" htmlFor="usr-ficha">Ficha de técnico</label>
            <select id="usr-ficha" className="form-select" value={datos.tecnico_id} onChange={e => cambiar('tecnico_id', e.target.value)}>
              <option value="">Sin vincular</option>
              {fichas.map(f => (
                <option key={f.id} value={f.id} disabled={fichasOcupadas.includes(f.id) && f.id !== initialValues?.tecnico_id}>
                  {f.nombre}{fichasOcupadas.includes(f.id) && f.id !== initialValues?.tecnico_id ? ' (ya tiene cuenta)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {datos.rol === 'tecnico' && !datos.tecnico_id && (
        <p style={{ fontSize: '0.8rem', color: '#b45309', margin: '-0.5rem 0 1rem' }}>
          Sin ficha vinculada el técnico no podrá ver instalaciones.
        </p>
      )}

      {editando && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={datos.activo} disabled={esPropia} onChange={e => cambiar('activo', e.target.checked)} />
          Cuenta activa {!datos.activo && <span style={{ color: '#b91c1c' }}>(no podrá iniciar sesión y se cerrarán sus sesiones)</span>}
        </label>
      )}
      {esPropia && <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1rem' }}>Es tu propia cuenta: no puedes desactivarla ni cambiar su rol.</p>}

      <button type="submit" className="btn-submit">{editando ? 'Guardar cambios' : 'Crear cuenta'}</button>
    </form>
  );
};

export default UsuarioForm;
