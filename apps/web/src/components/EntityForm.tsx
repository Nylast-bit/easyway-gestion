import React, { useState } from 'react';
import { tiposCliente, type Cliente, type Persona } from '@easyway/shared';

export type DatosFormularioPersona = { nombre: string; telefono: string; correo: string; tipo?: string; documento?: string; notas?: string };

interface EntityFormProps {
  etiqueta: string;
  onSubmit: (data: DatosFormularioPersona) => void;
  initialValues?: Persona;
  // Clientes añaden tipo (particular/empresa), cédula o RNC y notas.
  esCliente?: boolean;
}

const EntityForm: React.FC<EntityFormProps> = ({ etiqueta, onSubmit, initialValues, esCliente }) => {
  const cliente = initialValues as Cliente | undefined;
  const [formData, setFormData] = useState<DatosFormularioPersona>({
    nombre: initialValues?.nombre || '',
    telefono: initialValues?.telefono || '',
    correo: initialValues?.correo || '',
    ...(esCliente ? { tipo: cliente?.tipo ?? 'Particular', documento: cliente?.documento ?? '', notas: cliente?.notas ?? '' } : {}),
  });

  // Normalizar teléfono (solo números, +, -, espacios)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
        <label className="form-label" htmlFor="persona-nombre">{esCliente && formData.tipo === 'Empresa' ? 'Razón social *' : 'Nombre Completo *'}</label>
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
      {esCliente && (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="persona-tipo">Tipo</label>
            <select id="persona-tipo" name="tipo" className="form-select" value={formData.tipo} onChange={handleChange}>
              {tiposCliente.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="persona-documento">{formData.tipo === 'Empresa' ? 'RNC' : 'Cédula'}</label>
            <input id="persona-documento" name="documento" className="form-input" value={formData.documento} onChange={handleChange} maxLength={20} inputMode="numeric" />
          </div>
        </div>
      )}
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
      {esCliente && (
        <div className="form-group">
          <label className="form-label" htmlFor="persona-notas">Notas</label>
          <textarea id="persona-notas" name="notas" className="form-textarea" value={formData.notas} onChange={handleChange} maxLength={1000} />
        </div>
      )}
      <button type="submit" className="btn-submit">
        {initialValues ? 'Guardar Cambios' : `Agregar ${etiqueta}`}
      </button>
      {/* El botón de cancelar lo maneja el Drawer automáticamente al hacer clic fuera o en la X */}
    </form>
  );
};

export default EntityForm;
