import React, { useEffect, useState } from 'react';
import type { VehiculoFila } from '@easyway/shared';
import { Plus, Pencil, Trash2, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import VehicleForm, { type DatosFormularioVehiculo } from '../components/VehicleForm';
import { mensajeError, solicitarApi } from '../lib/api';

const Vehicles: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehiculoFila[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehiculoFila | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchVehicles = async () => {
    try { setVehicles(await solicitarApi<VehiculoFila[]>('/vehiculos')); }
    catch (error) { toast.error(mensajeError(error, 'Error al cargar vehículos')); }
  };

  useEffect(() => { fetchVehicles(); }, []);

  const handleOpenAdd = () => { setEditingVehicle(null); setIsDrawerOpen(true); };
  const handleOpenEdit = (v: VehiculoFila) => { setEditingVehicle(v); setIsDrawerOpen(true); };

  // La API rechaza borrar vehículos con historial (instalaciones, GPS o fotos) para no perder trazabilidad.
  const handleDelete = async (v: VehiculoFila) => {
    if (!window.confirm(`¿Eliminar el vehículo ${v.placa || v.marca || ''}?`)) return;
    try {
      await solicitarApi(`/vehiculos/${v.id}`, { metodo: 'DELETE' });
      toast.success('Vehículo eliminado');
      fetchVehicles();
    } catch (error) { toast.error(mensajeError(error, 'Error al eliminar')); }
  };

  // Datos y cambio de GPS se guardan en una sola transacción en la API.
  const handleSubmit = async (formData: DatosFormularioVehiculo) => {
    setIsSubmitting(true);
    try {
      if (editingVehicle) await solicitarApi(`/vehiculos/${editingVehicle.id}`, { metodo: 'PUT', cuerpo: formData });
      else await solicitarApi('/vehiculos', { cuerpo: formData });
      toast.success(editingVehicle ? 'Vehículo actualizado' : 'Vehículo agregado');
      setIsDrawerOpen(false);
      fetchVehicles();
    } catch (error) {
      toast.error(mensajeError(error, 'No se pudo guardar'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const termino = searchTerm.toLowerCase();
  const filteredVehicles = vehicles.filter(v =>
    v.cliente_nombre.toLowerCase().includes(termino) ||
    (v.placa || '').toLowerCase().includes(termino)
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Vehículos</h1>
        <button className="btn-primary" onClick={handleOpenAdd}>
          <Plus size={18} /> Agregar
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar por dueño o placa..."
        className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div>
        {filteredVehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Car size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron vehículos.</p>
          </div>
        ) : (
          filteredVehicles.map(v => (
            <div key={v.id} className="vehicle-card">
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '8px', background: 'var(--sidebar-hover)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Car size={24} color="var(--sidebar-active)" />
                </div>

                <div style={{ flex: 1 }}>
                  <div className="vehicle-header">
                    <span className="vehicle-title">{v.marca} {v.modelo}</span>
                    {v.año && <span className="vehicle-year">{v.año}</span>}
                  </div>
                  <div className="vehicle-owner">Dueño: {v.cliente_nombre}</div>
                  <div className="vehicle-tags">
                    {v.placa && <span className="vehicle-tag">Placa: {v.placa}</span>}
                    <span className="vehicle-tag">Color: {v.color || 'N/A'}</span>
                    {v.gps && <span className="vehicle-tag">GPS: {v.gps.imei}</span>}
                    {v.imagenes > 0 && <span className="vehicle-tag">📷 {v.imagenes} foto(s)</span>}
                  </div>
                </div>
              </div>
              <div className="entity-actions">
                <button className="btn-icon" aria-label="Editar vehículo" onClick={() => handleOpenEdit(v)}>
                  <Pencil size={18} />
                </button>
                <button className="btn-icon danger" aria-label="Eliminar vehículo" onClick={() => handleDelete(v)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => isSubmitting ? null : setIsDrawerOpen(false)}
        title={editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}
      >
        <VehicleForm
          key={editingVehicle?.id ?? 'nuevo'}
          onSubmit={handleSubmit}
          initialValues={editingVehicle || undefined}
          enviando={isSubmitting}
        />
      </Drawer>
    </div>
  );
};

export default Vehicles;
