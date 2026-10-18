import React, { useState } from 'react';
import type { Simcard } from '../types';

interface SimcardFormProps {
  onSubmit: (data: any) => void;
  initialValues?: Simcard;
}

const SimcardForm: React.FC<SimcardFormProps> = ({ onSubmit, initialValues }) => {
  const [formData, setFormData] = useState({
    numero: initialValues?.numero || '',
    fecha_compra: initialValues?.fecha_compra || '',
    fecha_vencimiento: initialValues?.fecha_vencimiento || ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = { ...formData };
    // Convertir fechas vacías a null para la BD
    if (!dataToSubmit.fecha_compra) dataToSubmit.fecha_compra = "";
    if (!dataToSubmit.fecha_vencimiento) dataToSubmit.fecha_vencimiento = "null";
    onSubmit(dataToSubmit);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Número (Único) *</label>
        <input type="text" name="numero" className="form-input" value={formData.numero} onChange={handleChange} maxLength={20} required />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Fecha de Compra</label>
          <input type="date" name="fecha_compra" className="form-input" value={formData.fecha_compra || ''} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha de Vencimiento</label>
          <input type="date" name="fecha_vencimiento" className="form-input" value={formData.fecha_vencimiento || ''} onChange={handleChange} />
        </div>
      </div>

      {/* Nota informativa para el usuario */}
      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: '1rem' }}>
        * El estado de la simcard se asignará automáticamente al vincularla con un GPS.
      </p>

      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : 'Agregar Simcard'}
      </button>
    </form>
  );
};

export default SimcardForm;
