import React, { useEffect, useState } from 'react';
import type { AsignacionHistorial, SimcardFila } from '@easyway/shared';
import { Plus, Pencil, Trash2, Cpu, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import SimcardForm, { type DatosFormularioSimcard } from '../components/SimcardForm';
import { formatearFecha, mensajeError, solicitarApi } from '../lib/api';

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
  const [simcards, setSimcards] = useState<SimcardFila[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SimcardFila | null>(null);

  // Estados para el modal de historial
  const [historyItem, setHistoryItem] = useState<SimcardFila | null>(null);
  const [historyData, setHistoryData] = useState<AsignacionHistorial[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchSimcards = async () => {
    try { setSimcards(await solicitarApi<SimcardFila[]>('/simcards')); }
    catch (error) { toast.error(mensajeError(error, 'Error al cargar simcards')); }
  };

  useEffect(() => { fetchSimcards(); }, []);

  const handleOpenAdd = () => { setEditingItem(null); setIsDrawerOpen(true); };
  const handleOpenEdit = (s: SimcardFila) => { setEditingItem(s); setIsDrawerOpen(true); };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar Simcard?')) return;
    try {
      await solicitarApi(`/simcards/${id}`, { metodo: 'DELETE' });
      toast.success('Simcard eliminada');
      fetchSimcards();
    } catch (error) { toast.error(mensajeError(error, 'Error al eliminar')); }
  };

  // El estado no se envía: lo gobiernan las asignaciones a GPS en la API.
  const handleSubmit = async (formData: DatosFormularioSimcard) => {
    try {
      if (editingItem) await solicitarApi(`/simcards/${editingItem.id}`, { metodo: 'PUT', cuerpo: formData });
      else await solicitarApi('/simcards', { cuerpo: formData });
      toast.success(editingItem ? 'Simcard actualizada' : 'Simcard agregada');
      setIsDrawerOpen(false);
      fetchSimcards();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo guardar')); }
  };

  // Historial de asignaciones de la SIM a equipos GPS
  const handleViewHistory = async (s: SimcardFila) => {
    setHistoryItem(s);
    setLoadingHistory(true);
    try { setHistoryData(await solicitarApi<AsignacionHistorial[]>(`/simcards/${s.id}/historial`)); }
    catch (error) { toast.error(mensajeError(error, 'Error al cargar historial')); }
    finally { setLoadingHistory(false); }
  };

  const filtered = simcards.filter(s => s.numero.includes(searchTerm.replace(/[\s-]+/g, '')));

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
                  <p>Vence: {s.fecha_vencimiento || 'N/A'}{s.gps ? ` | GPS: ${s.gps.imei}` : ''}</p>
                </div>
              </div>
              <div className="entity-actions" style={{ alignItems: 'center' }}>
                <span className={`status-tag ${getStatusClass(s.estado)}`}>{s.estado}</span>
                <button className="btn-icon" title="Ver Historial" aria-label="Ver historial" onClick={() => handleViewHistory(s)}><Clock size={18} /></button>
                <button className="btn-icon" aria-label="Editar simcard" onClick={() => handleOpenEdit(s)}><Pencil size={18} /></button>
                <button className="btn-icon danger" aria-label="Eliminar simcard" onClick={() => handleDelete(s.id)}><Trash2 size={18} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Drawer Agregar/Editar */}
      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={editingItem ? 'Editar Simcard' : 'Nueva Simcard'}>
        <SimcardForm key={editingItem?.id ?? 'nueva'} onSubmit={handleSubmit} initialValues={editingItem || undefined} />
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
                      <div className="vehicle-title">GPS: {asig.gps.imei}</div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Asignada el: {formatearFecha(asig.fecha_inicio)}
                      </div>
                      {asig.fecha_fin ? (
                        <span className="status-tag status-red" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                          Retirada el: {formatearFecha(asig.fecha_fin)}
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
