import React, { useEffect, useState } from 'react';
import type { InstalacionFila } from '@easyway/shared';
import { Plus, Pencil, Trash2, ClipboardList, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import Drawer from '../components/Drawer';
import InstallationForm, { type DatosFormularioInstalacion } from '../components/InstallationForm';
import AvanceInstalacionForm, { type DatosAvance } from '../components/AvanceInstalacionForm';
import GaleriaFotos from '../components/GaleriaFotos';
import { formatearFecha, mensajeError, solicitarApi } from '../lib/api';
import { useSesion } from '../lib/sesion';

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
  const [installations, setInstallations] = useState<InstalacionFila[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InstalacionFila | null>(null);
  // El panel lateral muestra el formulario completo (admin), el avance (técnico) o las fotos del vehículo.
  const [modo, setModo] = useState<'editar' | 'avance' | 'fotos'>('editar');
  const esTecnico = useSesion()?.rol === 'tecnico';

  const fetchInstallations = async () => {
    try { setInstallations(await solicitarApi<InstalacionFila[]>('/instalaciones')); }
    catch (error) { toast.error(mensajeError(error, 'Error al cargar instalaciones')); }
  };

  useEffect(() => { fetchInstallations(); }, []);

  const abrir = (i: InstalacionFila | null, nuevoModo: typeof modo) => { setEditingItem(i); setModo(nuevoModo); setIsDrawerOpen(true); };
  const handleOpenAdd = () => abrir(null, 'editar');
  const handleOpenEdit = (i: InstalacionFila) => abrir(i, esTecnico ? 'avance' : 'editar');

  const guardarAvance = async (datos: DatosAvance) => {
    if (!editingItem) return;
    try {
      await solicitarApi(`/instalaciones/${editingItem.id}/avance`, { metodo: 'PATCH', cuerpo: datos });
      toast.success('Avance guardado');
      setIsDrawerOpen(false);
      fetchInstallations();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo guardar el avance')); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    try {
      await solicitarApi(`/instalaciones/${id}`, { metodo: 'DELETE' });
      toast.success('Registro eliminado');
      fetchInstallations();
    } catch (error) { toast.error(mensajeError(error, 'Error al eliminar')); }
  };

  const handleSubmit = async (formData: DatosFormularioInstalacion) => {
    try {
      if (editingItem) await solicitarApi(`/instalaciones/${editingItem.id}`, { metodo: 'PUT', cuerpo: formData });
      else await solicitarApi('/instalaciones', { cuerpo: formData });
      toast.success(editingItem ? 'Instalación actualizada' : 'Instalación registrada');
      setIsDrawerOpen(false);
      fetchInstallations();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo guardar')); }
  };

  // Búsqueda integrada (Cliente, Placa o IMEI)
  const termino = searchTerm.toLowerCase();
  const filtered = installations.filter(i =>
    i.vehiculo.cliente_nombre.toLowerCase().includes(termino) ||
    (i.vehiculo.placa || '').toLowerCase().includes(termino) ||
    i.gps_imei.includes(searchTerm.trim())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>{esTecnico ? 'Mis instalaciones' : 'Instalaciones'}</h1>
        {!esTecnico && <button className="btn-primary" onClick={handleOpenAdd}><Plus size={18} /> Agregar</button>}
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
                    <span className="vehicle-year">{formatearFecha(i.fecha_instalacion)}</span>
                  </div>
                  <div className="vehicle-owner">
                    Cliente: {i.vehiculo.cliente_nombre} | Veh: {i.vehiculo.marca} {i.vehiculo.modelo} ({i.vehiculo.placa || 'S/P'})
                  </div>
                </div>
                <div className="entity-actions">
                  <button className="btn-icon" aria-label="Fotos del vehículo" title="Fotos del vehículo" onClick={() => abrir(i, 'fotos')}><Camera size={18} /></button>
                  <button className="btn-icon" aria-label={esTecnico ? 'Actualizar avance' : 'Editar instalación'} onClick={() => handleOpenEdit(i)}><Pencil size={18} /></button>
                  {!esTecnico && <button className="btn-icon danger" aria-label="Eliminar instalación" onClick={() => handleDelete(i.id)}><Trash2 size={18} /></button>}
                </div>
              </div>
              <div className="vehicle-tags" style={{ marginTop: '0.5rem' }}>
                {/* Etiqueta de Estado con color */}
                <span className={`status-tag ${getInstStatusClass(i.estado)}`}>{i.estado}</span>
                <span className="vehicle-tag">GPS: {i.gps_imei}</span>
                {i.simcard_numero && <span className="vehicle-tag">SIM: {i.simcard_numero}</span>}
                <span className="vehicle-tag">Técnico: {i.tecnico_nombre || 'N/A'}</span>
              </div>
              {i.notas && <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}><strong>Notas:</strong> {i.notas}</p>}
            </div>
          ))
        )}
      </div>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={modo === 'fotos' ? 'Fotos del vehículo' : modo === 'avance' ? 'Actualizar avance' : editingItem ? 'Editar Instalación' : 'Nueva Instalación'}
      >
        {modo === 'fotos' && editingItem && <GaleriaFotos key={`fotos-${editingItem.id}`} vehiculoId={editingItem.vehiculo_id} />}
        {modo === 'avance' && editingItem && <AvanceInstalacionForm key={`avance-${editingItem.id}`} instalacion={editingItem} onSubmit={guardarAvance} />}
        {modo === 'editar' && <InstallationForm key={editingItem?.id ?? 'nueva'} onSubmit={handleSubmit} initialValues={editingItem || undefined} />}
      </Drawer>
    </div>
  );
};

export default Installations;
