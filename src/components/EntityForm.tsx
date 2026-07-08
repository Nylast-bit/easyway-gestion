import React, { useState } from 'react';
import type { Client, Technician } from '../types';

interface EntityFormProps {
  type: 'client' | 'technician';
  onSubmit: (data: Client | Technician) => void;
  initialValues?: Client | Technician;
}

const EntityForm: React.FC<EntityFormProps> = ({ type, onSubmit, initialValues }) => {
  const [formData, setFormData] = useState({
    nombre: initialValues?.nombre || '',
    telefono: initialValues?.telefono || '',
    correo: initialValues?.correo || '',
  });

  // Normalizar teléfono (solo números, +, -, espacios)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'telefono') {
      const cleaned = value.replace(/[^\d+\-\s()]/g, '');
      setFormData({ ...formData, [name]: cleaned });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Nombre Completo *</label>
        <input
          type="text"
          name="nombre"
          className="form-input"
          value={formData.nombre}
          onChange={handleChange}
          maxLength={60}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label">Teléfono</label>
        <input
          type="tel"
          name="telefono"
          className="form-input"
          value={formData.telefono}
          onChange={handleChange}
          maxLength={80}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Correo Electrónico</label>
        <input
          type="email"
          name="correo"
          className="form-input"
          value={formData.correo}
          onChange={handleChange}
          maxLength={40}
        />
      </div>
      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : `Agregar ${type === 'client' ? 'Cliente' : 'Técnico'}`}
      </button>
      {/* El botón de cancelar lo maneja el Drawer automáticamente al hacer clic fuera o en la X */}
    </form>
  );
};

export default EntityForm;
