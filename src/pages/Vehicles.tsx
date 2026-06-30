import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Pencil, Trash2, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import VehicleForm from '../components/VehicleForm';

// Interfaz local para manejar el JOIN con clientes
interface VehicleWithClient {
  id: number;
  marca: string;
  modelo: string;
  año: number;
  placa: string;
  color: string;
  clientes?: { nombre: string };
}

const Vehicles: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleWithClient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);

  const fetchVehicles = async () => {
    // Hacemos un JOIN para traer el nombre del cliente dueño del vehículo
    const { data, error } = await supabase.from('vehiculos').select('*, clientes(nombre)');
    if (error) toast.error('Error al cargar vehículos');
    else setVehicles(data || []);
  };

  useEffect(() => { fetchVehicles(); }, []);

  const handleOpenAdd = () => { setEditingVehicle(null); setIsDrawerOpen(true); };

  // Antes de abrir la edición, buscamos si el vehículo tiene un GPS asignado actualmente
  const handleOpenEdit = async (v: VehicleWithClient) => {
    const { data } = await supabase
      .from('gps_asignaciones')
      .select('gps_id')
      .eq('vehiculo_id', v.id)
      .is('fecha_fin', null)
      .maybeSingle();

    setEditingVehicle({ ...v, gps_id_actual: data?.gps_id || '' });
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Eliminar este vehículo?')) {
      const { error } = await supabase.from('vehiculos').delete().eq('id', id);
      if (error) toast.error('Error al eliminar');
      else {
        toast.success('Vehículo eliminado');
        fetchVehicles();
      }
    }
  };

  const handleSubmit = async (formData: any) => {
    const { id, gps_id, ...vehData } = formData;

    if (editingVehicle) {
      // 1. Actualizar datos del vehículo
      const { error } = await supabase.from('vehiculos').update(vehData).eq('id', editingVehicle.id);
      if (error) return toast.error('Error: ' + error.message);

      // 2. Lógica de GPS: Si cambió el GPS asignado
      if (gps_id && gps_id !== editingVehicle.gps_id_actual) {
        // Cerrar asignación anterior si la tenía
        if (editingVehicle.gps_id_actual) {
           await supabase.from('gps_asignaciones').update({ fecha_fin: new Date() }).eq('gps_id', editingVehicle.gps_id_actual).eq('vehiculo_id', editingVehicle.id);
           await supabase.from('gps').update({ estado: 'Disponible' }).eq('id', editingVehicle.gps_id_actual);
        }
        // Crear nueva asignación
        await supabase.from('gps_asignaciones').insert([{ gps_id: Number(gps_id), vehiculo_id: editingVehicle.id, fecha_inicio: new Date() }]);
        await supabase.from('gps').update({ estado: 'Instalado' }).eq('id', gps_id);
      }

      toast.success('Vehículo actualizado');
    } else {
      // 1. Insertar nuevo vehículo
      const { data: newVeh, error } = await supabase.from('vehiculos').insert([vehData]).select('id');
      if (error) return toast.error('Error: ' + error.message);

      // 2. Si se le asignó un GPS al crearlo, registrar la asignación
      if (gps_id && newVeh) {
        await supabase.from('gps_asignaciones').insert([{ gps_id: Number(gps_id), vehiculo_id: newVeh[0].id, fecha_inicio: new Date() }]);
        await supabase.from('gps').update({ estado: 'Instalado' }).eq('id', gps_id);
      }

      toast.success('Vehículo agregado');
    }

    setIsDrawerOpen(false);
    fetchVehicles();
  };

  // Filtrado por nombre del dueño o por placa
  const filteredVehicles = vehicles.filter(v =>
    v.clientes?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.placa || '').toLowerCase().includes(searchTerm.toLowerCase())
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
              <div>
                <div className="vehicle-header">
                  <span className="vehicle-title">{v.marca} {v.modelo}</span>
                  {v.año && <span className="vehicle-year">{v.año}</span>}
                </div>
                <div className="vehicle-owner">Dueño: {v.clientes?.nombre || 'Desconocido'}</div>
                <div className="vehicle-tags">
                  {v.placa && <span className="vehicle-tag">Placa: {v.placa}</span>}
                  <span className="vehicle-tag">Color: {v.color}</span>
                </div>
              </div>
              <div className="entity-actions">
                <button className="btn-icon" onClick={() => handleOpenEdit(v)}>
                  <Pencil size={18} />
                </button>
                <button className="btn-icon danger" onClick={() => handleDelete(v.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}
      >
        <VehicleForm onSubmit={handleSubmit} initialValues={editingVehicle || undefined} />
      </Drawer>
    </div>
  );
};

export default Vehicles;
