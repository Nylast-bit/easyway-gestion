import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Simcard } from '../types';
import { Plus, Pencil, Trash2, Cpu, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import SimcardForm from '../components/SimcardForm';

// Función helper para asignar colores a los estados
const getStatusClass = (status: string) => {
  switch (status) {
    case 'Disponible': return 'status-green';
    case 'Asignada': return 'status-yellow';
    case 'Suspendida':
    case 'Vencida': return 'status-red';
    default: return 'status-gray';
  }
};

const Simcards: React.FC = () => {
  const [simcards, setSimcards] = useState<Simcard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Simcard | null>(null);

  // Estados para el modal de historial
  const [historyItem, setHistoryItem] = useState<Simcard | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchSimcards = async () => {
    const { data, error } = await supabase.from('simcards').select('*').order('created_at', { ascending: false });
    if (error) toast.error('Error al cargar simcards');
    else setSimcards(data || []);
  };

  useEffect(() => { fetchSimcards(); }, []);

  const handleOpenAdd = () => { setEditingItem(null); setIsDrawerOpen(true); };
  const handleOpenEdit = (s: Simcard) => { setEditingItem(s); setIsDrawerOpen(true); };

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Eliminar Simcard?')) {
      const { error } = await supabase.from('simcards').delete().eq('id', id);
      if (error) toast.error('Error al eliminar');
      else { toast.success('Simcard eliminada'); fetchSimcards(); }
    }
  };

  const handleSubmit = async (formData: any) => {
    if (editingItem) {
      // Al actualizar, excluimos el 'estado' del payload para no sobreescribir el de la BD
      const { estado, ...updateData } = formData;
      const { error } = await supabase.from('simcards').update(updateData).eq('id', editingItem.id);

      if (error) toast.error('Error: ' + error.message);
      else { toast.success('Simcard actualizada'); setIsDrawerOpen(false); fetchSimcards(); }
    } else {
      // Al insertar, dejamos que la BD ponga 'Disponible' por defecto (no enviamos estado)
      const { error } = await supabase.from('simcards').insert([formData]);
      if (error) toast.error('Error: ' + error.message);
      else { toast.success('Simcard agregada'); setIsDrawerOpen(false); fetchSimcards(); }
    }
  };

  // Función para obtener el historial de asignaciones de la SIM
  const handleViewHistory = async (s: Simcard) => {
    setHistoryItem(s);
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('simcard_asignaciones')
      .select('fecha_inicio, fecha_fin, gps(imei, modelo)')
      .eq('simcard_id', s.id)
      .order('fecha_inicio', { ascending: false });

    if (error) toast.error('Error al cargar historial');
    else setHistoryData(data || []);
    setLoadingHistory(false);
  };

  const filtered = simcards.filter(s => s.numero.includes(searchTerm));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Simcards</h1>
        <button className="btn-primary" onClick={handleOpenAdd}><Plus size={18} /> Agregar</button>
      </div>

      <input
        type="text" placeholder="Buscar por número..." className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }}
        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="entity-list">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Cpu size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron simcards.</p>
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.id} className="entity-card">
              <div className="entity-info">
                <div className="avatar"><Cpu size={18} /></div>
                <div className="entity-details">
                  <h3>{s.numero}</h3>
                  <p>Vence: {s.fecha_vencimiento || 'N/A'}</p>
                </div>
              </div>
              <div className="entity-actions" style={{ alignItems: 'center' }}>
                <span className={`status-tag ${getStatusClass(s.estado!)}`}>{s.estado}</span>
                <button className="btn-icon" title="Ver Historial" onClick={() => handleViewHistory(s)}><Clock size={18} /></button>
                <button className="btn-icon" onClick={() => handleOpenEdit(s)}><Pencil size={18} /></button>
                <button className="btn-icon danger" onClick={() => handleDelete(s.id!)}><Trash2 size={18} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Drawer Agregar/Editar */}
      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={editingItem ? 'Editar Simcard' : 'Nueva Simcard'}>
        <SimcardForm onSubmit={handleSubmit} initialValues={editingItem || undefined} />
      </Drawer>

      {/* Modal Historial */}
      {historyItem && (
        <div className="modal-overlay" onClick={() => setHistoryItem(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1.5rem' }}>Historial de {historyItem.numero}</h2>
            {loadingHistory ? <p>Cargando...</p> : historyData.length === 0 ? (
              <p style={{ color: '#6b7280' }}>Esta simcard no tiene asignaciones registradas.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {historyData.map((asig, index) => (
                  <div key={index} className="vehicle-card" style={{ margin: 0, opacity: asig.fecha_fin ? 0.7 : 1 }}>
                    <div>
                      <div className="vehicle-title">GPS: {asig.gps?.imei || 'Desconocido'}</div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Asignada el: {new Date(asig.fecha_inicio).toLocaleDateString()}
                      </div>
                      {asig.fecha_fin ? (
                        <span className="status-tag status-red" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                          Retirada el: {new Date(asig.fecha_fin).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="status-tag status-green" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                          Asignación Activa
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-cancel" style={{ marginTop: '1.5rem' }} onClick={() => setHistoryItem(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Simcards;
