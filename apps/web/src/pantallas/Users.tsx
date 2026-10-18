import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, UserCog } from 'lucide-react';
import toast from 'react-hot-toast';
import { LONGITUD_MINIMA_CONTRASENA, type Persona, type UsuarioFila } from '@easyway/shared';
import Drawer from '../components/Drawer';
import UsuarioForm, { type DatosFormularioUsuario } from '../components/UsuarioForm';
import { formatearFecha, mensajeError, solicitarApi } from '../lib/api';
import { useSesion } from '../lib/sesion';

const iniciales = (nombre: string) => {
  const partes = nombre.trim().split(/\s+/);
  return (partes[0].charAt(0) + (partes[1]?.charAt(0) ?? '')).toUpperCase();
};

// Gestión de cuentas (solo administradores): alta, edición, activación y contraseña.
const Users: React.FC = () => {
  const yo = useSesion();
  const [cuentas, setCuentas] = useState<UsuarioFila[]>([]);
  const [fichas, setFichas] = useState<Persona[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'editar' | 'contrasena'>('editar');
  const [seleccion, setSeleccion] = useState<UsuarioFila | null>(null);
  const [nuevaContrasena, setNuevaContrasena] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [lista, tecnicos] = await Promise.all([solicitarApi<UsuarioFila[]>('/usuarios'), solicitarApi<Persona[]>('/tecnicos')]);
      setCuentas(lista);
      setFichas(tecnicos);
    } catch (error) { toast.error(mensajeError(error, 'Error al cargar usuarios')); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = (cuenta: UsuarioFila | null, nuevoModo: typeof modo) => {
    setSeleccion(cuenta);
    setModo(nuevoModo);
    setNuevaContrasena('');
    setAbierto(true);
  };

  const guardar = async ({ contrasena, usuario, correo, ...resto }: DatosFormularioUsuario) => {
    try {
      if (seleccion) {
        await solicitarApi(`/usuarios/${seleccion.id}`, { metodo: 'PUT', cuerpo: { nombre: resto.nombre, rol: resto.rol, tecnico_id: resto.tecnico_id, activo: resto.activo } });
        toast.success('Cuenta actualizada');
      } else {
        await solicitarApi('/usuarios', { cuerpo: { nombre: resto.nombre, rol: resto.rol, tecnico_id: resto.tecnico_id, usuario, correo, contrasena } });
        toast.success('Cuenta creada');
      }
      setAbierto(false);
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo guardar la cuenta')); }
  };

  const restablecer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seleccion) return;
    try {
      await solicitarApi(`/usuarios/${seleccion.id}/contrasena`, { metodo: 'PUT', cuerpo: { contrasena: nuevaContrasena } });
      toast.success('Contraseña restablecida; se cerraron sus sesiones');
      setAbierto(false);
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo restablecer la contraseña')); }
  };

  const termino = busqueda.toLowerCase();
  const filtradas = cuentas.filter(c => [c.nombre, c.usuario, c.correo].some(v => v?.toLowerCase().includes(termino)));
  const fichasOcupadas = cuentas.flatMap(c => (c.tecnico_id ? [c.tecnico_id] : []));
  const ahora = Date.now();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Usuarios</h1>
        <button className="btn-primary" onClick={() => abrir(null, 'editar')}><Plus size={18} /> Agregar</button>
      </div>

      <input type="text" placeholder="Buscar por nombre, usuario o correo..." className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }} value={busqueda} onChange={e => setBusqueda(e.target.value)} />

      <div className="entity-list">
        {filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <UserCog size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron usuarios.</p>
          </div>
        ) : filtradas.map(cuenta => {
          const bloqueada = cuenta.bloqueado_hasta && Date.parse(cuenta.bloqueado_hasta) > ahora;
          return (
            <div key={cuenta.id} className="entity-card" style={{ alignItems: 'flex-start', opacity: cuenta.activo ? 1 : 0.65 }}>
              <div className="entity-info" style={{ alignItems: 'flex-start' }}>
                <div className="avatar">{iniciales(cuenta.nombre)}</div>
                <div className="entity-details">
                  <h3>{cuenta.nombre}{cuenta.id === yo?.id ? ' (tú)' : ''}</h3>
                  <p>{[cuenta.usuario && `@${cuenta.usuario}`, cuenta.correo].filter(Boolean).join(' · ')}</p>
                  <div className="vehicle-tags" style={{ marginTop: '0.4rem' }}>
                    <span className={`status-tag ${cuenta.rol === 'admin' ? 'status-yellow' : 'status-gray'}`}>{cuenta.rol === 'admin' ? 'Administrador' : 'Técnico'}</span>
                    <span className={`status-tag ${cuenta.activo ? 'status-green' : 'status-red'}`}>{cuenta.activo ? 'Activa' : 'Desactivada'}</span>
                    {cuenta.correo && <span className="vehicle-tag">{cuenta.correo_verificado ? 'Correo verificado' : 'Correo sin verificar'}</span>}
                    {cuenta.rol === 'tecnico' && <span className="vehicle-tag">Ficha: {cuenta.tecnico_nombre ?? 'sin vincular'}</span>}
                    {bloqueada && <span className="status-tag status-red">Bloqueada por intentos</span>}
                    <span className="vehicle-tag">Alta: {formatearFecha(cuenta.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="entity-actions">
                <button className="btn-icon" aria-label={`Restablecer contraseña de ${cuenta.nombre}`} title="Restablecer contraseña" onClick={() => abrir(cuenta, 'contrasena')}><KeyRound size={18} /></button>
                <button className="btn-icon" aria-label={`Editar ${cuenta.nombre}`} onClick={() => abrir(cuenta, 'editar')}><Pencil size={18} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <Drawer isOpen={abierto} onClose={() => setAbierto(false)}
        title={modo === 'contrasena' ? 'Restablecer contraseña' : seleccion ? 'Editar cuenta' : 'Nueva cuenta'}>
        {modo === 'contrasena' && seleccion ? (
          <form onSubmit={restablecer}>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
              Nueva contraseña para <strong>{seleccion.nombre}</strong>. Se cerrarán sus sesiones abiertas y se quitará cualquier bloqueo.
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="usr-nueva">Nueva contraseña</label>
              <input id="usr-nueva" type="password" className="form-input" autoComplete="new-password" value={nuevaContrasena}
                minLength={LONGITUD_MINIMA_CONTRASENA} onChange={e => setNuevaContrasena(e.target.value)} required />
            </div>
            <button type="submit" className="btn-submit">Restablecer</button>
          </form>
        ) : (
          <UsuarioForm key={seleccion?.id ?? 'nueva'} onSubmit={guardar} initialValues={seleccion ?? undefined}
            fichas={fichas} fichasOcupadas={fichasOcupadas} esPropia={seleccion?.id === yo?.id} />
        )}
      </Drawer>
    </div>
  );
};

export default Users;
