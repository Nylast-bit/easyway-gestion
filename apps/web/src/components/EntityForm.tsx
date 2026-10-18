import React, { useState } from 'react';
import type { Persona } from '@easyway/shared';

export type DatosFormularioPersona = { nombre: string; telefono: string; correo: string };

interface EntityFormProps {
  etiqueta: string;
  onSubmit: (data: DatosFormularioPersona) => void;
  initialValues?: Persona;
}

const EntityForm: React.FC<EntityFormProps> = ({ etiqueta, onSubmit, initialValues }) => {
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
        <label className="form-label" htmlFor="persona-nombre">Nombre Completo *</label>
        <input
          type="text"
          id="persona-nombre"
          name="nombre"
          className="form-input"
          value={formData.nombre}
          onChange={handleChange}
          maxLength={120}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="persona-telefono">Teléfono</label>
        <input
          type="tel"
          id="persona-telefono"
          name="telefono"
          className="form-input"
          value={formData.telefono}
          onChange={handleChange}
          maxLength={80}
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="persona-correo">Correo Electrónico</label>
        <input
          type="email"
          id="persona-correo"
          name="correo"
          className="form-input"
          value={formData.correo}
          onChange={handleChange}
          maxLength={254}
        />
      </div>
      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : `Agregar ${etiqueta}`}
      </button>
      {/* El botón de cancelar lo maneja el Drawer automáticamente al hacer clic fuera o en la X */}
    </form>
  );
};

export default EntityForm;
