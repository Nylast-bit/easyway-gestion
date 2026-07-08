import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import SearchableSelect from './SearchableSelect';

interface VehicleFormProps {
  onSubmit: (data: any) => void;
  initialValues?: any;
}

const VehicleForm: React.FC<VehicleFormProps> = ({ onSubmit, initialValues }) => {
  const [formData, setFormData] = useState({
    cliente_id: initialValues?.cliente_id || '',
    gps_id: '',
    marca: initialValues?.marca || '',
    modelo: initialValues?.modelo || '',
    año: initialValues?.año || '',
    placa: initialValues?.placa || '',
    chasis: initialValues?.chasis || '',
    color: initialValues?.color || ''
  });

  const [clients, setClients] = useState<any[]>([]);
  const [gpsOptions, setGpsOptions] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // Obtener clientes
      const { data: cliData } = await supabase.from('clientes').select('id, nombre');
      if (cliData) setClients(cliData);

      // Obtener GPS disponibles
      const { data: gpsData } = await supabase.from('gps').select('id, imei, modelo').eq('estado', 'Disponible');
      let finalGpsOptions = gpsData || [];

      // Si estamos editando, obtener el GPS actual asignado para mostrarlo
      if (initialValues?.id) {
        const { data: asigData } = await supabase
          .from('gps_asignaciones')
          .select('gps_id, gps(id, imei, modelo)')
          .eq('vehiculo_id', initialValues.id)
          .is('fecha_fin', null)
          .maybeSingle();

        if (asigData?.gps) {
          finalGpsOptions = [asigData.gps, ...finalGpsOptions];
          setFormData(prev => ({ ...prev, gps_id: asigData.gps_id }));
        }
      }
      setGpsOptions(finalGpsOptions);
    };
    fetchData();
  }, [initialValues]);

  // Forzar mayúsculas en ciertos campos
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const upperCaseFields = ['marca', 'modelo', 'placa', 'chasis', 'color'];
    setFormData({ ...formData, [name]: upperCaseFields.includes(name) ? value.toUpperCase() : value });
  };

  const handleSelectChange = (name: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit: any = { ...formData };

    // Convertir strings vacíos a null para la Base de Datos
    if (!dataToSubmit.placa || dataToSubmit.placa.trim() === '') dataToSubmit.placa = null;
    if (!dataToSubmit.chasis || dataToSubmit.chasis.trim() === '') dataToSubmit.chasis = null;
    if (!dataToSubmit.año || dataToSubmit.año.trim() === '') {
      dataToSubmit.año = null;
    } else {
      dataToSubmit.año = Number(dataToSubmit.año);
    }

    onSubmit(dataToSubmit);
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
          options={gpsOptions.map(g => ({ id: g.id, label: `${g.imei} (${g.modelo})` }))}
          value={formData.gps_id}
          onChange={(val) => handleSelectChange('gps_id', val)}
          placeholder="Buscar GPS disponible..."
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Marca *</label>
          <input type="text" name="marca" className="form-input" value={formData.marca} onChange={handleTextChange} maxLength={50} required />
        </div>
        <div className="form-group">
          <label className="form-label">Modelo *</label>
          <input type="text" name="modelo" className="form-input" value={formData.modelo} onChange={handleTextChange} maxLength={50} required />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Año</label>
          <input type="number" name="año" className="form-input" value={formData.año} onChange={handleTextChange} min="1990" max="2100" />
        </div>
        <div className="form-group">
          <label className="form-label">Placa</label>
          <input type="text" name="placa" className="form-input" value={formData.placa || ''} onChange={handleTextChange} maxLength={20} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Color</label>
          <input type="text" name="color" className="form-input" value={formData.color} onChange={handleTextChange} maxLength={30} />
        </div>
        <div className="form-group">
          <label className="form-label">Chasis / VIN</label>
          <input type="text" name="chasis" className="form-input" value={formData.chasis || ''} onChange={handleTextChange} maxLength={50} />
        </div>
      </div>

      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : 'Agregar Vehículo'}
      </button>
    </form>
  );
};

export default VehicleForm;
