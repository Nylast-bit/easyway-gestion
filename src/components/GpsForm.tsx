import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import SearchableSelect from './SearchableSelect';

interface GpsFormProps {
  onSubmit: (data: any) => void;
  initialValues?: any;
}

const GpsForm: React.FC<GpsFormProps> = ({ onSubmit, initialValues }) => {
  const [formData, setFormData] = useState({
    imei: initialValues?.imei || '',
    modelo: initialValues?.modelo || '',
    estado: initialValues?.estado || 'Disponible',
    simcard_id: ''
  });

  const [simcards, setSimcards] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // Traer simcards disponibles
      const { data: simData } = await supabase.from('simcards').select('id, numero').eq('estado', 'Disponible');
      let finalSimOptions = simData || [];

      // Si estamos editando, traer la simcard que ya tiene asignada
      if (initialValues?.id) {
        const { data: asigData } = await supabase
          .from('simcard_asignaciones')
          .select('simcard_id, simcards(id, numero)')
          .eq('gps_id', initialValues.id)
          .is('fecha_fin', null)
          .maybeSingle();

        if (asigData?.simcards) {
          finalSimOptions = [asigData.simcards, ...finalSimOptions];
          setFormData(prev => ({ ...prev, simcard_id: asigData.simcard_id }));
        }
      }
      setSimcards(finalSimOptions);
    };
    fetchData();
  }, [initialValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (name: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">IMEI (Único) *</label>
        <input type="text" name="imei" className="form-input" value={formData.imei} onChange={handleChange} maxLength={20} required />
      </div>
      <div className="form-group">
        <label className="form-label">Modelo</label>
        <input type="text" name="modelo" className="form-input" value={formData.modelo} onChange={handleChange} maxLength={50} />
      </div>

      <div className="form-group">
        <label className="form-label">Asignar Simcard (Opcional)</label>
        <SearchableSelect
          options={simcards.map(s => ({ id: s.id, label: s.numero }))}
          value={formData.simcard_id}
          onChange={(val) => handleSelectChange('simcard_id', val)}
          placeholder="Buscar simcard disponible..."
          allowClear={true}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Estado</label>
        <select name="estado" className="form-select" value={formData.estado} onChange={handleChange}>
          <option value="Disponible">Disponible</option>
          <option value="Instalado">Instalado</option>
          <option value="Retirado">Retirado</option>
          <option value="Dañado">Dañado</option>
        </select>
      </div>

      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : 'Agregar GPS'}
      </button>
    </form>
  );
};

export default GpsForm;
