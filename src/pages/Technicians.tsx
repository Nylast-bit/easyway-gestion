import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Technician } from '../types';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import EntityForm from '../components/EntityForm';

const Technicians: React.FC = () => {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  };

  const fetchTechnicians = async () => {
    const { data, error } = await supabase.from('tecnicos').select('*').order('nombre', { ascending: true });
    if (error) toast.error('Error al cargar técnicos');
    else setTechnicians(data || []);
  };

  useEffect(() => { fetchTechnicians(); }, []);

  const handleOpenAdd = () => { setEditingTech(null); setIsDrawerOpen(true); };
  const handleOpenEdit = (tech: Technician) => { setEditingTech(tech); setIsDrawerOpen(true); };

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Eliminar este técnico?')) {
      const { error } = await supabase.from('tecnicos').delete().eq('id', id);
      if (error) toast.error('Error al eliminar');
      else {
        toast.success('Técnico eliminado');
        fetchTechnicians();
      }
    }
  };

  const handleSubmit = async (formData: Technician) => {
    const cleanedPhone = formData.telefono.replace(/[^\d+]/g, '');
    const dataToSave = { ...formData, telefono: cleanedPhone };

    if (editingTech) {
      const { error } = await supabase.from('tecnicos').update(dataToSave).eq('id', editingTech.id);
      if (error) toast.error('Error: ' + error.message);
      else {
        toast.success('Técnico actualizado');
        setIsDrawerOpen(false);
        fetchTechnicians();
      }
    } else {
      const { error } = await supabase.from('tecnicos').insert([dataToSave]);
      if (error) toast.error('Error: ' + error.message);
      else {
        toast.success('Técnico agregado');
        setIsDrawerOpen(false);
        fetchTechnicians();
      }
    }
  };

  const filteredTechs = technicians.filter(t =>
    t.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Técnicos</h1>
        <button className="btn-primary" onClick={handleOpenAdd}>
          <Plus size={18} /> Agregar
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar técnico..."
        className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="entity-list">
        {filteredTechs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Wrench size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron técnicos.</p>
          </div>
        ) : (
          filteredTechs.map(tech => (
            <div key={tech.id} className="entity-card">
              <div className="entity-info">
                <div className="avatar">{getInitials(tech.nombre)}</div>
                <div className="entity-details">
                  <h3>{tech.nombre}</h3>
                  <p>📞 {tech.telefono} | ✉️ {tech.correo}</p>
                </div>
              </div>
              <div className="entity-actions">
                <button className="btn-icon" onClick={() => handleOpenEdit(tech)}>
                  <Pencil size={18} />
                </button>
                <button className="btn-icon danger" onClick={() => handleDelete(tech.id!)}>
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
        title={editingTech ? 'Editar Técnico' : 'Nuevo Técnico'}
      >
        <EntityForm
          type="technician"
          onSubmit={handleSubmit}
          initialValues={editingTech || undefined}
        />
      </Drawer>
    </div>
  );
};

export default Technicians;
