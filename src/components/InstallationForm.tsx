import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import SearchableSelect from './SearchableSelect';

interface InstallationFormProps {
  onSubmit: (data: any) => void;
  initialValues?: any;
}

const InstallationForm: React.FC<InstallationFormProps> = ({ onSubmit, initialValues }) => {
  const [formData, setFormData] = useState({
    vehiculo_id: initialValues?.vehiculo_id || '',
    gps_id: initialValues?.gps_id || '',
    simcard_id: initialValues?.simcard_id || '',
    tecnico_id: initialValues?.tecnico_id || '',
    fecha_instalacion: initialValues?.fecha_instalacion
      ? new Date(initialValues.fecha_instalacion).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    tipo: initialValues?.tipo || 'Instalación',
    asunto: initialValues?.asunto || '',
    notas: initialValues?.notas || '',
    estado: initialValues?.estado || 'En Proceso'
  });

  // Listas para los dropdowns
  const [clients, setClients] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [gpsList, setGpsList] = useState<any[]>([]);
  const [simcards, setSimcards] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  const [selectedClient, setSelectedClient] = useState<string>('');

  useEffect(() => {
    const fetchInitialData = async () => {
      // Cargar clientes
      const { data: cliData } = await supabase
        .from('clientes')
        .select('id, nombre');

      if (cliData) setClients(cliData);

      // Cargar técnicos
      const { data: techData } = await supabase
        .from('tecnicos')
        .select('id, nombre');

      if (techData) setTechnicians(techData);

      // Cargar GPS disponibles
      const { data: gpsData } = await supabase
        .from('gps')
        .select('id, imei, modelo')
        .eq('estado', 'Disponible');

      if (gpsData) setGpsList(gpsData);

      // Si estamos editando
      if (initialValues?.vehiculo_id) {
        const { data: vehData } = await supabase
          .from('vehiculos')
          .select('id, placa, marca, modelo, cliente_id')
          .eq('id', initialValues.vehiculo_id)
          .single();

        if (vehData) {
          setSelectedClient(vehData.cliente_id);
          setVehicles([vehData]);
        }
      }
    };

    fetchInitialData();
  }, [initialValues]);

  // Cargar vehículos del cliente seleccionado
  useEffect(() => {
    if (!selectedClient) {
      setVehicles([]);
      return;
    }

    const fetchVehicles = async () => {
      const { data } = await supabase
        .from('vehiculos')
        .select('id, placa, marca, modelo')
        .eq('cliente_id', selectedClient);

      setVehicles(data || []);
    };

    fetchVehicles();
  }, [selectedClient]);

  const handleGpsChange = async (gpsId: string | number) => {
    setFormData(prev => ({
      ...prev,
      gps_id: gpsId,
      simcard_id: ''
    }));

    const { data: simData } = await supabase
      .from('simcards')
      .select('id, numero')
      .eq('estado', 'Disponible');

    setSimcards(simData || []);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSelectChange = (name: string, value: string | number) => {
    if (name === 'cliente_id') {
      setSelectedClient(String(value));
      return;
    }

    if (name === 'gps_id') {
      handleGpsChange(value);
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const { cliente_id, ...dataToSubmit } = formData as any;

    onSubmit(dataToSubmit);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Cliente *</label>

          <SearchableSelect
            options={clients.map(c => ({
              id: c.id,
              label: c.nombre
            }))}
            value={selectedClient}
            onChange={val => handleSelectChange('cliente_id', val)}
            placeholder="Seleccione cliente..."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Vehículo *</label>

          <SearchableSelect
            options={vehicles.map(v => ({
              id: v.id,
              label: `${v.marca} ${v.modelo} - ${v.placa || 'S/P'}`
            }))}
            value={formData.vehiculo_id}
            onChange={val => handleSelectChange('vehiculo_id', val)}
            placeholder={
              selectedClient
                ? 'Seleccione vehículo...'
                : 'Elija un cliente primero'
            }
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">GPS *</label>

          <SearchableSelect
            options={gpsList.map(g => ({
              id: g.id,
              label: `${g.imei} (${g.modelo || 'N/A'})`
            }))}
            value={formData.gps_id}
            onChange={val => handleSelectChange('gps_id', val)}
            placeholder="Seleccione GPS..."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Simcard</label>

          <SearchableSelect
            options={simcards.map(s => ({
              id: s.id,
              label: s.numero
            }))}
            value={formData.simcard_id}
            onChange={val => handleSelectChange('simcard_id', val)}
            placeholder={
              formData.gps_id
                ? 'Asignar SIM (Opcional)'
                : 'Elija GPS primero'
            }
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Técnico *</label>

        <SearchableSelect
          options={technicians.map(t => ({
            id: t.id,
            label: t.nombre
          }))}
          value={formData.tecnico_id}
          onChange={val => handleSelectChange('tecnico_id', val)}
          placeholder="Seleccione técnico..."
        />
      </div>

      <div className="form-group">
        <label className="form-label">Fecha y Hora *</label>

        <input
          type="datetime-local"
          name="fecha_instalacion"
          className="form-input"
          value={formData.fecha_instalacion}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tipo</label>

          <select
            name="tipo"
            className="form-select"
            value={formData.tipo}
            onChange={handleChange}
          >
            <option>Instalación</option>
            <option>Mantenimiento</option>
            <option>Retiro</option>
            <option>Cambio de Equipo</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Estado</label>

          <select
            name="estado"
            className="form-select"
            value={formData.estado}
            onChange={handleChange}
          >
            <option value="En Proceso">En Proceso</option>
            <option value="Completado">Completado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Asunto</label>

        <input
          type="text"
          name="asunto"
          className="form-input"
          value={formData.asunto}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Notas</label>

        <textarea
          name="notas"
          className="form-textarea"
          value={formData.notas}
          onChange={handleChange}
        />
      </div>

      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : 'Registrar Instalación'}
      </button>
    </form>
  );
};

export default InstallationForm;
