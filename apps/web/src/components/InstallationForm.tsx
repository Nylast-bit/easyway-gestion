import React, { useState, useEffect } from 'react';
import { estadosInstalacion, type GpsFila, type InstalacionFila, type Persona, type SimcardFila, type TipoServicioFila, type VehiculoFila } from '@easyway/shared';
import SearchableSelect from './SearchableSelect';
import { aFechaHoraLocal, desdeFechaHoraLocal, solicitarApi } from '../lib/api';

export type DatosFormularioInstalacion = {
  vehiculo_id: string | number;
  gps_id: string | number;
  simcard_id: string | number;
  tecnico_id: string | number;
  fecha_instalacion: string | null;
  tipo_servicio_id: string | number;
  asunto: string;
  notas: string;
  estado: string;
};

interface InstallationFormProps {
  onSubmit: (data: DatosFormularioInstalacion) => void;
  initialValues?: InstalacionFila;
}

type OpcionSelect = { id: number; label: string };

const InstallationForm: React.FC<InstallationFormProps> = ({ onSubmit, initialValues }) => {
  const [formData, setFormData] = useState({
    vehiculo_id: initialValues?.vehiculo_id ?? '' as string | number,
    gps_id: initialValues?.gps_id ?? '' as string | number,
    simcard_id: initialValues?.simcard_id ?? '' as string | number,
    tecnico_id: initialValues?.tecnico_id ?? '' as string | number,
    // datetime-local muestra hora local; se convierte a ISO con zona al enviar.
    fecha_instalacion: aFechaHoraLocal(initialValues?.fecha_instalacion),
    tipo_servicio_id: initialValues?.tipo_servicio_id ?? '' as string | number,
    asunto: initialValues?.asunto || '',
    notas: initialValues?.notas || '',
    estado: initialValues?.estado || 'En Proceso'
  });

  // Listas para los dropdowns
  const [clients, setClients] = useState<OpcionSelect[]>([]);
  const [vehicles, setVehicles] = useState<OpcionSelect[]>([]);
  const [gpsList, setGpsList] = useState<OpcionSelect[]>([]);
  const [simcards, setSimcards] = useState<OpcionSelect[]>([]);
  const [technicians, setTechnicians] = useState<OpcionSelect[]>([]);
  const [tiposServicio, setTiposServicio] = useState<TipoServicioFila[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | number>(initialValues?.vehiculo.cliente_id ?? '');

  useEffect(() => {
    const opciones = async <T,>(ruta: string, etiqueta: (fila: T) => OpcionSelect) =>
      (await solicitarApi<T[]>(ruta).catch(() => [] as T[])).map(etiqueta);
    void (async () => {
      const [cli, tec, equipos, sims] = await Promise.all([
        opciones<Persona>('/clientes', c => ({ id: c.id, label: c.nombre })),
        opciones<Persona>('/tecnicos', t => ({ id: t.id, label: t.nombre })),
        opciones<GpsFila>('/gps?estado=Disponible', g => ({ id: g.id, label: `${g.imei} (${g.modelo || 'N/A'})` })),
        opciones<SimcardFila>('/simcards?estado=Disponible', s => ({ id: s.id, label: s.numero })),
      ]);
      const tipos = await solicitarApi<TipoServicioFila[]>('/tipos-servicio').catch(() => [] as TipoServicioFila[]);
      // Tipos inactivos solo se muestran si ya están en esta instalación.
      setTiposServicio(tipos.filter(t => t.activo || t.id === initialValues?.tipo_servicio_id));
      if (!initialValues && tipos.length) setFormData(prev => (prev.tipo_servicio_id ? prev : { ...prev, tipo_servicio_id: tipos.find(t => t.activo)?.id ?? '' }));
      setClients(cli);
      setTechnicians(tec);
      // Al editar se conservan como opción el GPS y la SIM registrados aunque ya no estén disponibles.
      const gpsActual = initialValues && !equipos.some(g => g.id === initialValues.gps_id)
        ? [{ id: initialValues.gps_id, label: initialValues.gps_imei }] : [];
      const simActual = initialValues?.simcard_id && !sims.some(s => s.id === initialValues.simcard_id)
        ? [{ id: initialValues.simcard_id, label: initialValues.simcard_numero ?? '' }] : [];
      setGpsList([...gpsActual, ...equipos]);
      setSimcards([...simActual, ...sims]);
    })();
  }, [initialValues]);

  // Cargar vehículos del cliente seleccionado
  useEffect(() => {
    if (!selectedClient) { setVehicles([]); return; }
    solicitarApi<VehiculoFila[]>(`/vehiculos?cliente_id=${selectedClient}`)
      .then(lista => setVehicles(lista.map(v => ({ id: v.id, label: `${v.marca || ''} ${v.modelo || ''} - ${v.placa || 'S/P'}`.trim() }))))
      .catch(() => setVehicles([]));
  }, [selectedClient]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (name: 'cliente_id' | 'vehiculo_id' | 'gps_id' | 'simcard_id' | 'tecnico_id', value: string | number) => {
    if (name === 'cliente_id') {
      setSelectedClient(value);
      setFormData(prev => ({ ...prev, vehiculo_id: '' }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...formData, fecha_instalacion: desdeFechaHoraLocal(formData.fecha_instalacion) });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Cliente *</label>
          <SearchableSelect
            options={clients}
            value={selectedClient}
            onChange={val => handleSelectChange('cliente_id', val)}
            placeholder="Seleccione cliente..."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Vehículo *</label>
          <SearchableSelect
            options={vehicles}
            value={formData.vehiculo_id}
            onChange={val => handleSelectChange('vehiculo_id', val)}
            placeholder={selectedClient ? 'Seleccione vehículo...' : 'Elija un cliente primero'}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">GPS *</label>
          <SearchableSelect
            options={gpsList}
            value={formData.gps_id}
            onChange={val => handleSelectChange('gps_id', val)}
            placeholder="Seleccione GPS..."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Simcard</label>
          <SearchableSelect
            options={simcards}
            value={formData.simcard_id}
            onChange={val => handleSelectChange('simcard_id', val)}
            placeholder="Asignar SIM (Opcional)"
            allowClear={true}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Técnico</label>
        <SearchableSelect
          options={technicians}
          value={formData.tecnico_id}
          onChange={val => handleSelectChange('tecnico_id', val)}
          placeholder="Seleccione técnico..."
          allowClear={true}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="inst-fecha">Fecha y Hora *</label>
        <input
          id="inst-fecha"
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
          <label className="form-label" htmlFor="inst-tipo">Tipo</label>
          <select id="inst-tipo" name="tipo_servicio_id" className="form-select" value={formData.tipo_servicio_id} onChange={handleChange} required>
            {tiposServicio.map(tipo => <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="inst-estado">Estado</label>
          <select id="inst-estado" name="estado" className="form-select" value={formData.estado} onChange={handleChange}>
            {estadosInstalacion.map(estado => <option key={estado} value={estado}>{estado}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="inst-asunto">Asunto</label>
        <input id="inst-asunto" type="text" name="asunto" className="form-input" value={formData.asunto} onChange={handleChange} maxLength={200} />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="inst-notas">Notas</label>
        <textarea id="inst-notas" name="notas" className="form-textarea" value={formData.notas} onChange={handleChange} maxLength={2000} />
      </div>

      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : 'Registrar Instalación'}
      </button>
    </form>
  );
};

export default InstallationForm;
