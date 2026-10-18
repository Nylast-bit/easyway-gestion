import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Client } from '../types';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import EntityForm from '../components/EntityForm';

const Clients: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Función para obtener las iniciales del nombre para el Avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  };

  const fetchClients = async () => {
    const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
    if (error) toast.error('Error al cargar clientes');
    else setClients(data || []);
  };

  useEffect(() => { fetchClients(); }, []);

  const handleOpenAdd = () => {
    setEditingClient(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setIsDrawerOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Eliminar este cliente?')) {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) toast.error('Error al eliminar');
      else {
        toast.success('Cliente eliminado');
        fetchClients();
      }
    }
  };

  const handleSubmit = async (formData: Client) => {
    // Normalizar teléfono antes de enviar a la BD
    const cleanedPhone = formData.telefono.replace(/[^\d+]/g, '');
    const dataToSave = { ...formData, telefono: cleanedPhone };

    if (editingClient) {
      // Actualizar
      const { error } = await supabase.from('clientes').update(dataToSave).eq('id', editingClient.id);
      if (error) toast.error('Error: ' + error.message);
      else {
        toast.success('Cliente actualizado');
        setIsDrawerOpen(false);
        fetchClients();
      }
    } else {
      // Agregar
      const { error } = await supabase.from('clientes').insert([dataToSave]);
      if (error) toast.error('Error: ' + error.message);
      else {
        toast.success('Cliente agregado');
        setIsDrawerOpen(false);
        fetchClients();
      }
    }
  };

  // Filtrado en tiempo real
  const filteredClients = clients.filter(c =>
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      {/* Encabezado de la página */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Clientes</h1>
        <button className="btn-primary" onClick={handleOpenAdd}>
          <Plus size={18} /> Agregar
        </button>
      </div>

      {/* Barra de búsqueda local */}
      <input
        type="text"
        placeholder="Buscar cliente..."
        className="form-input"
        style={{ marginBottom: '1.5rem', maxWidth: '400px' }}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Lista de clientes */}
      <div className="entity-list">
        {filteredClients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Users size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No se encontraron clientes.</p>
          </div>
        ) : (
          filteredClients.map(client => (
            <div key={client.id} className="entity-card">
              <div className="entity-info">
                <div className="avatar">{getInitials(client.nombre)}</div>
                <div className="entity-details">
                  <h3>{client.nombre}</h3>
                  <p>📞 {client.telefono} | ✉️ {client.correo}</p>
                </div>
              </div>
              <div className="entity-actions">
                <button className="btn-icon" onClick={() => handleOpenEdit(client)}>
                  <Pencil size={18} />
                </button>
                <button className="btn-icon danger" onClick={() => handleDelete(client.id!)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Drawer para Agregar/Editar */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
      >
        <EntityForm
          type="client"
          onSubmit={handleSubmit}
          initialValues={editingClient || undefined}
        />
      </Drawer>
    </div>
  );
};

export default Clients;
