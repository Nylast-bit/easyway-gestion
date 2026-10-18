import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Pencil, Trash2, Car, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import VehicleForm from '../components/VehicleForm';

interface VehicleWithClient {
  id: number;
  marca: string;
  modelo: string;
  año: number;
  placa: string;
  color: string;
  clientes?: { nombre: string };
  vehiculo_imagenes?: { id: number; storage_path: string }[];
}

const Vehicles: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleWithClient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const fetchVehicles = async () => {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*, clientes(nombre), vehiculo_imagenes(id, storage_path)');
    if (error) toast.error('Error al cargar vehículos');
    else setVehicles(data || []);
  };

  useEffect(() => { fetchVehicles(); }, []);

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setIsDrawerOpen(true);
  };

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
    if (!window.confirm('¿Eliminar este vehículo? Se eliminarán también todas sus fotos.')) return;

    const { data: imgs } = await supabase
      .from('vehiculo_imagenes')
      .select('storage_path')
      .eq('vehiculo_id', id);

    if (imgs && imgs.length > 0) {
      const paths = imgs.map(i => i.storage_path);
      await supabase.storage.from('vehiculos').remove(paths);
    }

    const { error } = await supabase.from('vehiculos').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Vehículo eliminado');
      fetchVehicles();
    }
  };

  const uploadImages = async (vehicleId: number, files: File[]) => {
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const path = `${vehicleId}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('vehiculos').upload(path, file);
      if (uploadError) {
        toast.error(`Error al subir una imagen: ${uploadError.message}`);
        continue;
      }

      const { error: dbError } = await supabase
        .from('vehiculo_imagenes')
        .insert([{ vehiculo_id: vehicleId, storage_path: path }]);

      if (dbError) console.error('Error guardando registro de imagen:', dbError);
    }
  };

  const deleteImages = async (imageIds: number[]) => {
    for (const imgId of imageIds) {
      const { data: img } = await supabase
        .from('vehiculo_imagenes')
        .select('storage_path')
        .eq('id', imgId)
        .single();

      if (img?.storage_path) {
        await supabase.storage.from('vehiculos').remove([img.storage_path]);
      }
      await supabase.from('vehiculo_imagenes').delete().eq('id', imgId);
    }
  };

  const handleSubmit = async (formData: any, newImages: File[], imagesToDelete: number[]) => {
    setIsSubmitting(true);
    const { id, gps_id, ...vehData } = formData;
    const targetGpsId = gps_id ? Number(gps_id) : null; // Convertir a null si está vacío

    try {
      if (editingVehicle) {
        // === MODO EDICIÓN ===
        if (imagesToDelete.length > 0) await deleteImages(imagesToDelete);

        const { error } = await supabase.from('vehiculos').update(vehData).eq('id', editingVehicle.id);
        if (error) {
          toast.error('Error: ' + error.message);
          return;
        }

        // 3. Lógica de GPS: Si cambió el GPS asignado (o si se quitó)
        if (targetGpsId !== (editingVehicle.gps_id_actual || null)) {
          // Cerrar asignación anterior si la tenía
          if (editingVehicle.gps_id_actual) {
            await supabase.from('gps_asignaciones')
            .update({ fecha_fin: new Date() })
            .eq('gps_id', editingVehicle.gps_id_actual)
            .eq('vehiculo_id', editingVehicle.id)
            .is('fecha_fin', null); // Solo la asignación activa
            await supabase.from('gps')
            .update({ estado: 'Disponible' })
            .eq('id', editingVehicle.gps_id_actual);
          }

          // Crear nueva asignación si se seleccionó uno nuevo
          if (targetGpsId) {
            await supabase.from('gps_asignaciones')
            .insert([{ gps_id: targetGpsId, vehiculo_id: editingVehicle.id, fecha_inicio: new Date() }]);
            await supabase.from('gps')
            .update({ estado: 'Instalado' })
            .eq('id', targetGpsId);
          }
        }

        if (newImages.length > 0) await uploadImages(editingVehicle.id, newImages);

        toast.success('Vehículo actualizado');
      } else {
        // === MODO CREACIÓN ===
        const { data: newVeh, error } = await supabase.from('vehiculos').insert([vehData]).select('id');
        if (error) {
          toast.error('Error: ' + error.message);
          return;
        }

        if (targetGpsId && newVeh) {
          await supabase.from('gps_asignaciones').insert([{ gps_id: targetGpsId, vehiculo_id: newVeh[0].id, fecha_inicio: new Date() }]);
          await supabase.from('gps').update({ estado: 'Instalado' }).eq('id', targetGpsId);
        }

        if (newVeh && newImages.length > 0) await uploadImages(newVeh[0].id, newImages);

        toast.success('Vehículo agregado');
      }

      setIsDrawerOpen(false);
      fetchVehicles();
    } catch (err) {
      console.error(err);
      toast.error('Ocurrió un error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredVehicles = vehicles.filter(v =>
    v.clientes?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.placa || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFirstImageUrl = (v: VehicleWithClient) => {
    if (!v.vehiculo_imagenes || v.vehiculo_imagenes.length === 0) return null;
    const { data } = supabase.storage.from('vehiculos').getPublicUrl(v.vehiculo_imagenes[0].storage_path);
    return data.publicUrl;
  };

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
          filteredVehicles.map(v => {
            const thumb = getFirstImageUrl(v);
            return (
              <div key={v.id} className="vehicle-card">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div
                    style={{ cursor: thumb ? 'pointer' : 'default' }}
                    onClick={() => thumb && setLightboxImage(thumb)}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={v.marca}
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '8px',
                        background: 'var(--sidebar-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Car size={24} color="var(--sidebar-active)" />
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div className="vehicle-header">
                      <span className="vehicle-title">{v.marca} {v.modelo}</span>
                      {v.año && <span className="vehicle-year">{v.año}</span>}
                    </div>
                    <div className="vehicle-owner">Dueño: {v.clientes?.nombre || 'Desconocido'}</div>
                    <div className="vehicle-tags">
                      {v.placa && <span className="vehicle-tag">Placa: {v.placa}</span>}
                      <span className="vehicle-tag">Color: {v.color || 'N/A'}</span>
                      {v.vehiculo_imagenes && v.vehiculo_imagenes.length > 0 && (
                        <span className="vehicle-tag">📷 {v.vehiculo_imagenes.length} foto(s)</span>
                      )}
                    </div>
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
            );
          })
        )}
      </div>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => isSubmitting ? null : setIsDrawerOpen(false)}
        title={editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}
      >
        <VehicleForm
          onSubmit={handleSubmit}
          initialValues={editingVehicle || undefined}
        />
      </Drawer>

      {/* MODAL VISOR DE IMAGEN */}
      {lightboxImage && (
        <div className="modal-overlay" onClick={() => setLightboxImage(null)} style={{ padding: '1rem' }}>
          <img
            src={lightboxImage}
            alt="Vista completa"
            className="image-lightbox"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="btn-icon danger"
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '0.5rem', borderRadius: '50%' }}
            onClick={() => setLightboxImage(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Vehicles;
