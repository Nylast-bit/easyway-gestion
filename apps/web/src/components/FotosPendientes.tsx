import React, { useEffect, useMemo, useRef } from 'react';
import { Camera, Image as ImageIcon, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { FOTOS_MAXIMAS_POR_TRABAJO } from '@easyway/shared';
import { esFotoPosible } from '../lib/imagenes';

// Fotos elegidas en el formulario de un trabajo nuevo: se guardan en el teléfono hasta enviar el trabajo
// y entonces se suben. La cámara toma una por vez; se puede pulsar "Tomar foto" las veces que haga falta.
const FotosPendientes: React.FC<{ archivos: File[]; onCambio: (archivos: File[]) => void }> = ({ archivos, onCambio }) => {
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const vistas = useMemo(() => archivos.map(archivo => URL.createObjectURL(archivo)), [archivos]);
  useEffect(() => () => vistas.forEach(url => URL.revokeObjectURL(url)), [vistas]);

  const agregar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegidos = Array.from(e.target.files ?? []).filter(archivo => {
      if (!esFotoPosible(archivo)) toast.error(`${archivo.name}: usa JPG, PNG o WebP`);
      return esFotoPosible(archivo);
    });
    e.target.value = '';
    const disponibles = FOTOS_MAXIMAS_POR_TRABAJO - archivos.length;
    if (elegidos.length > disponibles) toast.error(`Máximo ${FOTOS_MAXIMAS_POR_TRABAJO} fotos por trabajo.`);
    onCambio([...archivos, ...elegidos.slice(0, Math.max(disponibles, 0))]);
  };

  return (
    <div className="form-group">
      <label className="form-label">Fotos — {archivos.length}/{FOTOS_MAXIMAS_POR_TRABAJO}</label>
      {archivos.length > 0 && (
        <div className="vehicle-images-grid">
          {archivos.map((_, i) => (
            <div key={vistas[i]} className="vehicle-image-preview">
              <img src={vistas[i]} alt={`Foto ${i + 1} por subir`} />
              <button type="button" className="vehicle-image-remove" aria-label={`Quitar foto ${i + 1}`}
                onClick={() => onCambio(archivos.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {archivos.length < FOTOS_MAXIMAS_POR_TRABAJO && (
        <div className="vehicle-image-actions">
          <button type="button" className="vehicle-action-btn" onClick={() => camaraRef.current?.click()}>
            <Camera size={16} /> Tomar foto
          </button>
          <button type="button" className="vehicle-action-btn" onClick={() => archivoRef.current?.click()}>
            <Upload size={16} /> Adjuntar
          </button>
        </div>
      )}
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={agregar} data-testid="camara-trabajo" />
      <input ref={archivoRef} type="file" accept="image/*" multiple hidden onChange={agregar} data-testid="adjuntar-trabajo" />
      {archivos.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <ImageIcon size={12} /> Toma fotos con la cámara o adjúntalas de la galería. Se suben al enviar el trabajo.
        </p>
      )}
    </div>
  );
};

export default FotosPendientes;
