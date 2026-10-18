import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Pencil, Trash2, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import InstallationForm from '../components/InstallationForm';

// Función helper para asignar colores a los estados de instalación
const getInstStatusClass = (status: string) => {
  switch (status) {
    case 'Completado': return 'status-green';
    case 'En Proceso': return 'status-yellow';
    case 'Cancelado': return 'status-red';
    default: return 'status-gray';
  }
};

const Installations: React.FC = () => {
  const [installations, setInstallations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const fetchInstallations = async () => {
    // JOIN de 4 tablas para obtener toda la info en una sola consulta
    const { data, error } = await supabase.from('instalaciones').select(`
      *,
      vehiculos(placa, marca, modelo, clientes(nombre)),
      gps(imei),
      simcards(numero),
      tecnicos(nombre)
    `).order('fecha_instalacion', { ascending: false });

    if (error) toast.error('Error al cargar instalaciones');
    else setInstallations(data || []);
  };

  useEffect(() => { fetchInstallations(); }, []);

  const handleOpenAdd = () => { setEditingItem(null); setIsDrawerOpen(true); };
  const handleOpenEdit = (i: any) => { setEditingItem(i); setIsDrawerOpen(true); };

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Eliminar este registro?')) {
      const { error } = await supabase.from('instalaciones').delete().eq('id', id);
      if (error) toast.error('Error al eliminar');
      else { toast.success('Registro eliminado'); fetchInstallations(); }
    }
  };

  const handleSubmit = async (formData: any) => {
    // Asegurar que los campos vacíos vayan como null
    const dataToSubmit = { ...formData };
    if (!dataToSubmit.simcard_id) dataToSubmit.simcard_id = null;

    if (editingItem) {
      const { error } = await supabase.from('instalaciones').update(dataToSubmit).eq('id', editingItem.id);
      if (error) return toast.error('Error: ' + error.message);
      toast.success('Instalación actualizada');
    } else {
      const { error } = await supabase.from('instalaciones').insert([dataToSubmit]);
      if (error) return toast.error('Error: ' + error.message);
      toast.success('Instalación registrada');
    }
    setIsDrawerOpen(false);
    fetchInstallations();
  };

  // Búsqueda integrada (Cliente, Placa o IMEI)
  const filtered = installations.filter(i =>
    i.vehiculos?.clientes?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.vehiculos?.placa || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.gps?.imei?.includes(searchTerm)
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Instalaciones</h1>
        <button className="btn-primary" onClick={handleOpenAdd}><Plus size={18} /> Agregar</button>
      </div>

      <input
        type="text" placeholder="Buscar por cliente, placa o IMEI..." className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }}
        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="entity-list">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <ClipboardList size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron registros.</p>
          </div>
        ) : (
          filtered.map(i => (
            <div key={i.id} className="vehicle-card" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div className="vehicle-header">
                    <span className="vehicle-title">{i.tipo}: {i.asunto || 'Sin asunto'}</span>
                    <span className="vehicle-year">{new Date(i.fecha_instalacion).toLocaleDateString()}</span>
                  </div>
                  <div className="vehicle-owner">
                    Cliente: {i.vehiculos?.clientes?.nombre || 'N/A'} | Veh: {i.vehiculos?.marca} {i.vehiculos?.modelo} ({i.vehiculos?.placa || 'S/P'})
                  </div>
                </div>
                <div className="entity-actions">
                  <button className="btn-icon" onClick={() => handleOpenEdit(i)}><Pencil size={18} /></button>
                  <button className="btn-icon danger" onClick={() => handleDelete(i.id)}><Trash2 size={18} /></button>
                </div>
              </div>
              <div className="vehicle-tags" style={{ marginTop: '0.5rem' }}>
                {/* Etiqueta de Estado con color */}
                <span className={`status-tag ${getInstStatusClass(i.estado)}`}>{i.estado}</span>
                <span className="vehicle-tag">GPS: {i.gps?.imei || 'N/A'}</span>
                {i.simcards?.numero && <span className="vehicle-tag">SIM: {i.simcards.numero}</span>}
                <span className="vehicle-tag">Técnico: {i.tecnicos?.nombre || 'N/A'}</span>
              </div>
              {i.notas && <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}><strong>Notas:</strong> {i.notas}</p>}
            </div>
          ))
        )}
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={editingItem ? 'Editar Instalación' : 'Nueva Instalación'}>
        <InstallationForm onSubmit={handleSubmit} initialValues={editingItem || undefined} />
      </Drawer>
    </div>
  );
};

export default Installations;
