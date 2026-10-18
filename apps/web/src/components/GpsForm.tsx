import React, { useState, useEffect } from 'react';
import { estadosGps, type GpsFila, type SimcardFila } from '@easyway/shared';
import SearchableSelect from './SearchableSelect';
import { solicitarApi } from '../lib/api';

export type DatosFormularioGps = { imei: string; modelo: string; estado: GpsFila['estado']; simcard_id: string | number; fecha_vencimiento: string };

interface GpsFormProps {
  onSubmit: (data: DatosFormularioGps) => void;
  initialValues?: GpsFila;
}

const GpsForm: React.FC<GpsFormProps> = ({ onSubmit, initialValues }) => {
  const [formData, setFormData] = useState<DatosFormularioGps>({
    imei: initialValues?.imei || '',
    modelo: initialValues?.modelo || '',
    estado: initialValues?.estado || 'Disponible',
    simcard_id: initialValues?.simcard?.id ?? '',
    fecha_vencimiento: initialValues?.fecha_vencimiento ?? ''
  });

  const [simcards, setSimcards] = useState<{ id: number; numero: string }[]>([]);

  useEffect(() => {
    // Simcards disponibles más la que ya tiene asignada este GPS.
    solicitarApi<SimcardFila[]>('/simcards?estado=Disponible')
      .then(disponibles => setSimcards([...(initialValues?.simcard ? [initialValues.simcard] : []), ...disponibles]))
      .catch(() => setSimcards(initialValues?.simcard ? [initialValues.simcard] : []));
  }, [initialValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label" htmlFor="gps-imei">IMEI (15 dígitos) *</label>
        <input id="gps-imei" type="text" name="imei" className="form-input" value={formData.imei} onChange={handleChange} maxLength={20} inputMode="numeric" required />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="gps-modelo">Modelo</label>
        <input id="gps-modelo" type="text" name="modelo" className="form-input" value={formData.modelo} onChange={handleChange} maxLength={50} />
      </div>

      <div className="form-group">
        <label className="form-label">Asignar Simcard (Opcional)</label>
        <SearchableSelect
          options={simcards.map(s => ({ id: s.id, label: s.numero }))}
          value={formData.simcard_id}
          onChange={(val) => setFormData(prev => ({ ...prev, simcard_id: val }))}
          placeholder="Buscar simcard disponible..."
          allowClear={true}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="gps-vence">Vence el</label>
        <input id="gps-vence" type="date" name="fecha_vencimiento" className="form-input" value={formData.fecha_vencimiento} onChange={handleChange} />
        <small style={{ color: '#6b7280' }}>Se fija a 1 año al instalarlo en un vehículo; cámbialo si el cliente pagó otro periodo.</small>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="gps-estado">Estado</label>
        <select id="gps-estado" name="estado" className="form-select" value={formData.estado} onChange={handleChange}>
          {estadosGps.map(estado => <option key={estado} value={estado}>{estado}</option>)}
        </select>
        {initialValues?.vehiculo && formData.estado !== 'Instalado' && (
          <p style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.4rem' }}>
            Al guardar, el GPS se retirará del vehículo {initialValues.vehiculo.placa || initialValues.vehiculo.marca || ''}.
          </p>
        )}
      </div>

      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : 'Agregar GPS'}
      </button>
    </form>
  );
};

export default GpsForm;
