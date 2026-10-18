import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { FOTOS_MAXIMAS_POR_VEHICULO, TAMANO_MAXIMO_FOTO, type FotoVehiculo } from '@easyway/shared';
import { mensajeError, solicitarApi } from '../lib/api';

const TIPOS_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

// Fotos de un vehículo en almacenamiento privado. Cada operación se guarda al momento;
// las URL son temporales (10 min) y se renuevan al volver a abrir la galería.
const GaleriaFotos: React.FC<{ vehiculoId: number }> = ({ vehiculoId }) => {
  const [fotos, setFotos] = useState<FotoVehiculo[]>([]);
  const [subiendo, setSubiendo] = useState(0);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try { setFotos(await solicitarApi<FotoVehiculo[]>(`/fotos?vehiculo_id=${vehiculoId}`)); }
    catch (error) { toast.error(mensajeError(error, 'No se pudieron cargar las fotos')); }
  }, [vehiculoId]);

  useEffect(() => { void cargar(); }, [cargar]);

  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = '';
    const disponibles = FOTOS_MAXIMAS_POR_VEHICULO - fotos.length;
    if (elegidos.length > disponibles) toast.error(`Solo puedes agregar ${disponibles} foto(s) más (máximo ${FOTOS_MAXIMAS_POR_VEHICULO}).`);
    const validos = elegidos.slice(0, Math.max(disponibles, 0)).filter(archivo => {
      if (!TIPOS_ADMITIDOS.includes(archivo.type)) { toast.error(`${archivo.name}: usa JPG, PNG o WebP`); return false; }
      if (archivo.size > TAMANO_MAXIMO_FOTO) { toast.error(`${archivo.name}: supera ${TAMANO_MAXIMO_FOTO / 1024 / 1024} MB`); return false; }
      return true;
    });
    let guardadas = 0;
    // En serie: el servidor bloquea el vehículo durante cada subida para respetar el límite.
    for (const archivo of validos) {
      setSubiendo(n => n + 1);
      try {
        const formulario = new FormData();
        formulario.set('vehiculo_id', String(vehiculoId));
        formulario.set('archivo', archivo);
        const nueva = await solicitarApi<FotoVehiculo>('/fotos', { cuerpo: formulario });
        setFotos(actuales => [...actuales, nueva]);
        guardadas++;
      } catch (error) {
        toast.error(mensajeError(error, `No se pudo subir ${archivo.name}`));
      } finally {
        setSubiendo(n => n - 1);
      }
    }
    if (guardadas) toast.success(guardadas === 1 ? 'Foto guardada' : `${guardadas} fotos guardadas`);
  };

  const borrar = async (foto: FotoVehiculo) => {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    try {
      await solicitarApi(`/fotos/${foto.id}`, { metodo: 'DELETE' });
      setFotos(actuales => actuales.filter(f => f.id !== foto.id));
      toast.success('Foto eliminada');
    } catch (error) { toast.error(mensajeError(error, 'No se pudo eliminar la foto')); }
  };

  const puedeAgregar = fotos.length + subiendo < FOTOS_MAXIMAS_POR_VEHICULO;

  return (
    <div className="form-group">
      <label className="form-label">Fotos del vehículo — {fotos.length}/{FOTOS_MAXIMAS_POR_VEHICULO}</label>

      <div className="vehicle-images-grid">
        {fotos.map(foto => (
          <div key={foto.id} className="vehicle-image-preview" onClick={() => setAmpliada(foto.url)}>
            <img src={foto.url} alt={`Foto del vehículo${foto.autor ? ` subida por ${foto.autor}` : ''}`} />
            {foto.propia && (
              <button type="button" className="vehicle-image-remove" aria-label="Eliminar foto"
                onClick={e => { e.stopPropagation(); void borrar(foto); }}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: subiendo }, (_, i) => (
          <div key={`subiendo-${i}`} className="vehicle-image-preview" style={{ display: 'grid', placeItems: 'center' }}>
            <Loader2 size={20} className="girando" aria-label="Subiendo foto" />
          </div>
        ))}
      </div>

      {puedeAgregar && (
        <div className="vehicle-image-actions">
          <button type="button" className="vehicle-action-btn" onClick={() => archivoRef.current?.click()}>
            <Upload size={16} /> Subir archivos
          </button>
          <button type="button" className="vehicle-action-btn" onClick={() => camaraRef.current?.click()}>
            <Camera size={16} /> Tomar foto
          </button>
        </div>
      )}
      <input ref={archivoRef} type="file" accept={TIPOS_ADMITIDOS.join(',')} multiple hidden onChange={subir} data-testid="subir-fotos" />
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={subir} />

      {fotos.length === 0 && !subiendo && (
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <ImageIcon size={12} /> Sin fotos todavía. JPG, PNG o WebP de hasta {TAMANO_MAXIMO_FOTO / 1024 / 1024} MB.
        </p>
      )}

      {ampliada && createPortal(
        <div className="modal-overlay" onClick={() => setAmpliada(null)} style={{ padding: '1rem', zIndex: 9999 }}>
          <img src={ampliada} alt="Vista completa" className="image-lightbox" onClick={e => e.stopPropagation()} />
          <button className="btn-icon danger" aria-label="Cerrar vista"
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '0.5rem', borderRadius: '50%' }}
            onClick={() => setAmpliada(null)}>
            <X size={24} />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GaleriaFotos;
