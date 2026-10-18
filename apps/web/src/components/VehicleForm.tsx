import React, { useState, useEffect } from 'react';
import type { GpsFila, Persona, VehiculoFila } from '@easyway/shared';
import { Image as ImageIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import GaleriaFotos from './GaleriaFotos';
import { solicitarApi } from '../lib/api';

export type DatosFormularioVehiculo = {
  cliente_id: string | number;
  gps_id: string | number;
  marca: string;
  modelo: string;
  año: string | number;
  placa: string;
  chasis: string;
  color: string;
};

interface VehicleFormProps {
  onSubmit: (data: DatosFormularioVehiculo) => void;
  initialValues?: VehiculoFila;
  enviando?: boolean;
}

const VehicleForm: React.FC<VehicleFormProps> = ({ onSubmit, initialValues, enviando }) => {
  // La API normaliza mayúsculas y convierte vacíos en null.
  const [formData, setFormData] = useState<DatosFormularioVehiculo>({
    cliente_id: initialValues?.cliente_id ?? '',
    gps_id: initialValues?.gps?.id ?? '',
    marca: initialValues?.marca || '',
    modelo: initialValues?.modelo || '',
    año: initialValues?.año ?? '',
    placa: initialValues?.placa || '',
    chasis: initialValues?.chasis || '',
    color: initialValues?.color || ''
  });

  const [clients, setClients] = useState<Persona[]>([]);
  const [gpsOptions, setGpsOptions] = useState<{ id: number; imei: string; modelo: string | null }[]>([]);

  useEffect(() => {
    solicitarApi<Persona[]>('/clientes').then(setClients).catch(() => setClients([]));
    // GPS disponibles más el que ya tiene instalado este vehículo.
    const actual = initialValues?.gps ? [initialValues.gps] : [];
    solicitarApi<GpsFila[]>('/gps?estado=Disponible')
      .then(disponibles => setGpsOptions([...actual, ...disponibles]))
      .catch(() => setGpsOptions(actual));
  }, [initialValues]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const upperCaseFields = ['marca', 'modelo', 'placa', 'chasis', 'color'];
    setFormData({ ...formData, [name]: upperCaseFields.includes(name) ? value.toUpperCase() : value });
  };

  const handleSelectChange = (name: 'cliente_id' | 'gps_id', value: string | number) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Asignar a Cliente *</label>
        <SearchableSelect
          options={clients.map(c => ({ id: c.id, label: c.nombre }))}
          value={formData.cliente_id}
          onChange={(val) => handleSelectChange('cliente_id', val)}
          placeholder="Escriba el nombre del cliente..."
        />
      </div>

      <div className="form-group">
        <label className="form-label">Asignar GPS (Opcional)</label>
        <SearchableSelect
          options={gpsOptions.map(g => ({ id: g.id, label: `${g.imei} (${g.modelo || 'N/A'})` }))}
          value={formData.gps_id}
          onChange={(val) => handleSelectChange('gps_id', val)}
          placeholder="Buscar GPS disponible..."
          allowClear={true}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="veh-marca">Marca *</label>
          <input id="veh-marca" type="text" name="marca" className="form-input" value={formData.marca} onChange={handleTextChange} maxLength={50} required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="veh-modelo">Modelo *</label>
          <input id="veh-modelo" type="text" name="modelo" className="form-input" value={formData.modelo} onChange={handleTextChange} maxLength={50} required />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="veh-anio">Año</label>
          <input id="veh-anio" type="number" name="año" className="form-input" value={formData.año} onChange={handleTextChange} min="1950" max="2100" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="veh-placa">Placa</label>
          <input id="veh-placa" type="text" name="placa" className="form-input" value={formData.placa} onChange={handleTextChange} maxLength={20} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="veh-color">Color</label>
          <input id="veh-color" type="text" name="color" className="form-input" value={formData.color} onChange={handleTextChange} maxLength={30} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="veh-chasis">Chasis / VIN</label>
          <input id="veh-chasis" type="text" name="chasis" className="form-input" value={formData.chasis} onChange={handleTextChange} maxLength={50} />
        </div>
      </div>

      {/* Las fotos se guardan al momento en almacenamiento privado; requieren un vehículo ya creado. */}
      {initialValues ? <GaleriaFotos vehiculoId={initialValues.id} /> : (
        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0.5rem 0 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <ImageIcon size={14} /> Guarda el vehículo para poder agregar fotos.
        </p>
      )}

      <button type="submit" className="btn-submit" disabled={enviando}>
        {enviando ? 'Guardando…' : initialValues ? 'Guardar Cambios' : 'Agregar Vehículo'}
      </button>
    </form>
  );
};

export default VehicleForm;
