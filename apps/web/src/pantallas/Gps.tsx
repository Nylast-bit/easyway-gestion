import React, { useEffect, useState } from 'react';
import type { GpsFila } from '@easyway/shared';
import { Plus, Pencil, Trash2, Satellite } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import GpsForm, { type DatosFormularioGps } from '../components/GpsForm';
import { mensajeError, solicitarApi } from '../lib/api';

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Disponible': return 'status-green';
    case 'Instalado': return 'status-yellow';
    case 'Retirado':
    case 'Dañado': return 'status-red';
    default: return 'status-gray';
  }
};

const Gps: React.FC = () => {
  const [gpsList, setGpsList] = useState<GpsFila[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GpsFila | null>(null);

  // La API devuelve cada GPS con su simcard y vehículo activos.
  const fetchGps = async () => {
    try { setGpsList(await solicitarApi<GpsFila[]>('/gps')); }
    catch (error) { toast.error(mensajeError(error, 'Error al cargar GPS')); }
  };

  useEffect(() => { fetchGps(); }, []);

  const handleOpenAdd = () => { setEditingItem(null); setIsDrawerOpen(true); };
  const handleOpenEdit = (g: GpsFila) => { setEditingItem(g); setIsDrawerOpen(true); };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar GPS?')) return;
    try {
      await solicitarApi(`/gps/${id}`, { metodo: 'DELETE' });
      toast.success('GPS eliminado');
      fetchGps();
    } catch (error) { toast.error(mensajeError(error, 'Error al eliminar')); }
  };

  // La API cambia la simcard y, si el GPS deja de estar "Instalado", lo retira del vehículo, todo en una transacción.
  const handleSubmit = async (formData: DatosFormularioGps) => {
    try {
      if (editingItem) await solicitarApi(`/gps/${editingItem.id}`, { metodo: 'PUT', cuerpo: formData });
      else await solicitarApi('/gps', { cuerpo: formData });
      toast.success(editingItem ? 'GPS actualizado' : 'GPS agregado');
      setIsDrawerOpen(false);
      fetchGps();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo guardar')); }
  };

  const filtered = gpsList.filter(g =>
    g.imei.includes(searchTerm.trim()) ||
    (g.modelo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>GPS</h1>
        <button className="btn-primary" onClick={handleOpenAdd}><Plus size={18} /> Agregar</button>
      </div>

      <input
        type="text" placeholder="Buscar por IMEI o modelo..." className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }}
        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="entity-list">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Satellite size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron GPS.</p>
          </div>
        ) : (
          filtered.map(g => (
            <div key={g.id} className="entity-card" style={{ alignItems: 'flex-start' }}>
              <div className="entity-info" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div className="avatar"><Satellite size={18} /></div>
                  <div className="entity-details">
                    <h3>IMEI: {g.imei}</h3>
                    <p>Modelo: {g.modelo || 'N/A'}</p>
                  </div>
                </div>

                {/* Etiquetas de relaciones */}
                <div className="vehicle-tags" style={{ marginLeft: '58px', marginTop: '0.5rem' }}>
                  <span className={`status-tag ${getStatusClass(g.estado)}`}>{g.estado}</span>
                  {g.simcard && <span className="vehicle-tag">SIM: {g.simcard.numero}</span>}
                  {g.vehiculo && <span className="vehicle-tag">Veh: {g.vehiculo.marca} {g.vehiculo.modelo} ({g.vehiculo.placa || 'S/P'})</span>}
                </div>
              </div>

              <div className="entity-actions">
                <button className="btn-icon" aria-label="Editar GPS" onClick={() => handleOpenEdit(g)}><Pencil size={18} /></button>
                <button className="btn-icon danger" aria-label="Eliminar GPS" onClick={() => handleDelete(g.id)}><Trash2 size={18} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={editingItem ? 'Editar GPS' : 'Nuevo GPS'}>
        <GpsForm key={editingItem?.id ?? 'nuevo'} onSubmit={handleSubmit} initialValues={editingItem || undefined} />
      </Drawer>
    </div>
  );
};

export default Gps;
