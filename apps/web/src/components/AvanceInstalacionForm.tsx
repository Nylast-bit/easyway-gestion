import React, { useState } from 'react';
import { estadosInstalacion, type InstalacionFila } from '@easyway/shared';

export type DatosAvance = { estado: string; notas: string };

// Lo que un técnico puede actualizar de su propia instalación.
const AvanceInstalacionForm: React.FC<{ instalacion: InstalacionFila; onSubmit: (datos: DatosAvance) => void }> = ({ instalacion, onSubmit }) => {
  const [datos, setDatos] = useState<DatosAvance>({ estado: instalacion.estado, notas: instalacion.notas ?? '' });

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(datos); }}>
      <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
        {instalacion.vehiculo.cliente_nombre} · {instalacion.vehiculo.marca} {instalacion.vehiculo.modelo} ({instalacion.vehiculo.placa || 'S/P'}) · GPS {instalacion.gps_imei}
      </p>
      <div className="form-group">
        <label className="form-label" htmlFor="avance-estado">Estado</label>
        <select id="avance-estado" className="form-select" value={datos.estado} onChange={e => setDatos({ ...datos, estado: e.target.value })}>
          {estadosInstalacion.map(estado => <option key={estado} value={estado}>{estado}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="avance-notas">Notas</label>
        <textarea id="avance-notas" className="form-textarea" value={datos.notas} maxLength={2000}
          onChange={e => setDatos({ ...datos, notas: e.target.value })} />
      </div>
      <button type="submit" className="btn-submit">Guardar avance</button>
    </form>
  );
};

export default AvanceInstalacionForm;
