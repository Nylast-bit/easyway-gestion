import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Cliente, Persona } from '@easyway/shared';
import Drawer from './Drawer';
import EntityForm, { type DatosFormularioPersona } from './EntityForm';
import { mensajeError, solicitarApi } from '../lib/api';

interface ListaPersonasProps {
  titulo: string;
  ruta: '/clientes' | '/tecnicos';
  singular: string;
  icono: LucideIcon;
}

const iniciales = (nombre: string) => {
  const partes = nombre.trim().split(/\s+/);
  return (partes[0].charAt(0) + (partes[1]?.charAt(0) ?? '')).toUpperCase();
};

// Pantalla común de clientes y técnicos: misma forma de datos y mismas reglas en la API.
const ListaPersonas: React.FC<ListaPersonasProps> = ({ titulo, ruta, singular, icono: Icono }) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const [editando, setEditando] = useState<Persona | null>(null);

  const cargar = useCallback(async () => {
    try { setPersonas(await solicitarApi<Persona[]>(ruta)); }
    catch (error) { toast.error(mensajeError(error, `Error al cargar ${titulo.toLowerCase()}`)); }
  }, [ruta, titulo]);

  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = (persona: Persona | null) => { setEditando(persona); setCajonAbierto(true); };

  const eliminar = async (persona: Persona) => {
    if (!window.confirm(`¿Eliminar ${singular.toLowerCase()} "${persona.nombre}"?`)) return;
    try {
      await solicitarApi(`${ruta}/${persona.id}`, { metodo: 'DELETE' });
      toast.success(`${singular} eliminado`);
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'Error al eliminar')); }
  };

  const guardar = async (datos: DatosFormularioPersona) => {
    try {
      if (editando) await solicitarApi(`${ruta}/${editando.id}`, { metodo: 'PUT', cuerpo: datos });
      else await solicitarApi(ruta, { cuerpo: datos });
      toast.success(editando ? `${singular} actualizado` : `${singular} agregado`);
      setCajonAbierto(false);
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo guardar')); }
  };

  const filtradas = personas.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>{titulo}</h1>
        <button className="btn-primary" onClick={() => abrir(null)}>
          <Plus size={18} /> Agregar
        </button>
      </div>

      <input
        type="text"
        placeholder={`Buscar ${singular.toLowerCase()}...`}
        className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }}
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      <div className="entity-list">
        {filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Icono size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron {titulo.toLowerCase()}.</p>
          </div>
        ) : (
          filtradas.map(persona => (
            <div key={persona.id} className="entity-card">
              <div className="entity-info">
                <div className="avatar">{iniciales(persona.nombre)}</div>
                <div className="entity-details">
                  <h3>{persona.nombre}{ruta === '/clientes' && (persona as Cliente).tipo === 'Empresa' && <span className="status-tag status-gray" style={{ marginLeft: '0.5rem' }}>Empresa</span>}</h3>
                  <p>📞 {persona.telefono || 'Sin teléfono'} | ✉️ {persona.correo || 'Sin correo'}</p>
                </div>
              </div>
              <div className="entity-actions">
                <button className="btn-icon" aria-label={`Editar ${persona.nombre}`} onClick={() => abrir(persona)}>
                  <Pencil size={18} />
                </button>
                <button className="btn-icon danger" aria-label={`Eliminar ${persona.nombre}`} onClick={() => eliminar(persona)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Drawer isOpen={cajonAbierto} onClose={() => setCajonAbierto(false)} title={editando ? `Editar ${singular}` : `Nuevo ${singular}`}>
        <EntityForm
          key={editando?.id ?? 'nuevo'}
          etiqueta={singular}
          esCliente={ruta === '/clientes'}
          onSubmit={guardar}
          initialValues={editando ?? undefined}
        />
      </Drawer>
    </div>
  );
};

export default ListaPersonas;
