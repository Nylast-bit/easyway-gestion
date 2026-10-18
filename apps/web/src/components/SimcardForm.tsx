import React, { useState } from 'react';
import type { SimcardFila } from '@easyway/shared';

export type DatosFormularioSimcard = { numero: string; fecha_compra: string; fecha_vencimiento: string };

interface SimcardFormProps {
  onSubmit: (data: DatosFormularioSimcard) => void;
  initialValues?: SimcardFila;
}

const SimcardForm: React.FC<SimcardFormProps> = ({ onSubmit, initialValues }) => {
  // Fechas vacías se envían como "" y la API las guarda como null.
  const [formData, setFormData] = useState<DatosFormularioSimcard>({
    numero: initialValues?.numero || '',
    fecha_compra: initialValues?.fecha_compra || '',
    fecha_vencimiento: initialValues?.fecha_vencimiento || ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label" htmlFor="sim-numero">Número (Único) *</label>
        <input id="sim-numero" type="text" name="numero" className="form-input" value={formData.numero} onChange={handleChange} maxLength={25} required />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="sim-compra">Fecha de Compra</label>
          <input id="sim-compra" type="date" name="fecha_compra" className="form-input" value={formData.fecha_compra} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="sim-vence">Fecha de Vencimiento</label>
          <input id="sim-vence" type="date" name="fecha_vencimiento" className="form-input" value={formData.fecha_vencimiento} onChange={handleChange} />
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
