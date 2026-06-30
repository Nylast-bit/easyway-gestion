import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Pencil, Trash2, Satellite } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import GpsForm from '../components/GpsForm';

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
  const [gpsList, setGpsList] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const fetchGps = async () => {
    // Hacemos JOIN con simcard_asignaciones y gps_asignaciones para mostrar todo en la tarjeta
    const { data, error } = await supabase
      .from('gps')
      .select('*, gps_asignaciones(vehiculo_id, fecha_fin, vehiculos(placa, marca, modelo)), simcard_asignaciones(simcard_id, fecha_fin, simcards(numero))');

    if (error) toast.error('Error al cargar GPS');
    else {
      // Filtramos para mostrar solo las asignaciones activas (sin fecha_fin)
      const cleaned = data?.map((g: any) => ({
        ...g,
        gps_asignaciones: g.gps_asignaciones.filter((a: any) => !a.fecha_fin),
        simcard_asignaciones: g.simcard_asignaciones.filter((a: any) => !a.fecha_fin)
      }));
      setGpsList(cleaned || []);
    }
  };

  useEffect(() => { fetchGps(); }, []);

  const handleOpenAdd = () => { setEditingItem(null); setIsDrawerOpen(true); };
  const handleOpenEdit = (g: any) => { setEditingItem(g); setIsDrawerOpen(true); };

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Eliminar GPS?')) {
      const { error } = await supabase.from('gps').delete().eq('id', id);
      if (error) toast.error('Error al eliminar');
      else { toast.success('GPS eliminado'); fetchGps(); }
    }
  };

  const handleSubmit = async (formData: any) => {
    const { id, simcard_id, ...gpsData } = formData;
    const targetSimId = simcard_id ? Number(simcard_id) : null;

    if (editingItem) {
      // 1. Actualizar GPS
      await supabase.from('gps').update(gpsData).eq('id', editingItem.id);

      const currentSimId = editingItem.simcard_asignaciones[0]?.simcard_id || null;

      // 2. Si la simcard cambió, actualizar asignaciones
      if (targetSimId !== currentSimId) {
        if (currentSimId) {
          await supabase.from('simcard_asignaciones').update({ fecha_fin: new Date() }).eq('simcard_id', currentSimId).eq('gps_id', editingItem.id);
          await supabase.from('simcards').update({ estado: 'Disponible' }).eq('id', currentSimId);
        }
        if (targetSimId) {
          await supabase.from('simcard_asignaciones').insert([{ simcard_id: targetSimId, gps_id: editingItem.id, fecha_inicio: new Date() }]);
          await supabase.from('simcards').update({ estado: 'Asignada' }).eq('id', targetSimId);
        }
      }
      toast.success('GPS actualizado');
    } else {
      // 1. Insertar nuevo GPS
      const { data: newGps, error } = await supabase.from('gps').insert([gpsData]).select('id');
      if (error) return toast.error('Error: ' + error.message);

      // 2. Asignar Simcard si se seleccionó
      if (targetSimId && newGps) {
        await supabase.from('simcard_asignaciones').insert([{ simcard_id: targetSimId, gps_id: newGps[0].id, fecha_inicio: new Date() }]);
        await supabase.from('simcards').update({ estado: 'Asignada' }).eq('id', targetSimId);
      }
      toast.success('GPS agregado');
    }
    setIsDrawerOpen(false);
    fetchGps();
  };

  const filtered = gpsList.filter(g =>
    g.imei.includes(searchTerm) ||
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
          filtered.map(g => {
            const asigVeh = g.gps_asignaciones[0];
            const asigSim = g.simcard_asignaciones[0];
            return (
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
                    {asigSim && <span className="vehicle-tag">SIM: {asigSim.simcards?.numero}</span>}
                    {asigVeh && <span className="vehicle-tag">Veh: {asigVeh.vehiculos?.marca} {asigVeh.vehiculos?.modelo} ({asigVeh.vehiculos?.placa})</span>}
                  </div>
                </div>

                <div className="entity-actions">
                  <button className="btn-icon" onClick={() => handleOpenEdit(g)}><Pencil size={18} /></button>
                  <button className="btn-icon danger" onClick={() => handleDelete(g.id)}><Trash2 size={18} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={editingItem ? 'Editar GPS' : 'Nuevo GPS'}>
        <GpsForm onSubmit={handleSubmit} initialValues={editingItem || undefined} />
      </Drawer>
    </div>
  );
};

export default Gps;
