import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // <-- IMPORTACIÓN DEL PORTAL
import { supabase } from '../lib/supabaseClient';
import SearchableSelect from './SearchableSelect';
import { Upload, X, Image as ImageIcon, Camera } from 'lucide-react';

interface VehicleFormProps {
  onSubmit: (data: any, newImages: File[], imagesToDelete: number[]) => void;
  initialValues?: any;
}

interface ExistingImage {
  id: number;
  storage_path: string;
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

  // Estado de imágenes
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<number[]>([]);

  // Visor de imágenes (Lightbox)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: cliData } = await supabase.from('clientes').select('id, nombre');
      if (cliData) setClients(cliData);

      const { data: gpsData } = await supabase.from('gps').select('id, imei, modelo').eq('estado', 'Disponible');
      let finalGpsOptions = gpsData || [];

      if (initialValues?.id) {
        const { data: asigData } = await supabase
          .from('gps_asignaciones')
          .select('gps_id, gps(id, imei, modelo)')
          .eq('vehiculo_id', initialValues.id)
          .is('fecha_fin', null)
          .maybeSingle();

        if (asigData?.gps) {
          const gpsAsignado = Array.isArray(asigData.gps) ? asigData.gps[0] : asigData.gps;
          finalGpsOptions = [gpsAsignado, ...finalGpsOptions];
          setFormData(prev => ({ ...prev, gps_id: asigData.gps_id }));
        }

        const { data: imgData } = await supabase
          .from('vehiculo_imagenes')
          .select('id, storage_path')
          .eq('vehiculo_id', initialValues.id)
          .order('id', { ascending: true });

        if (imgData) setExistingImages(imgData);
      }
      setGpsOptions(finalGpsOptions);
    };
    fetchData();
  }, [initialValues]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const upperCaseFields = ['marca', 'modelo', 'placa', 'chasis', 'color'];
    setFormData({ ...formData, [name]: upperCaseFields.includes(name) ? value.toUpperCase() : value });
  };

  const handleSelectChange = (name: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const currentCount = existingImages.length - imagesToDelete.length + newImages.length;
    const remaining = 5 - currentCount;

    if (files.length > remaining) {
      alert(`Solo puedes agregar ${remaining} imagen(es) más (máximo 5 totales).`);
    }

    const toAdd = files.slice(0, remaining);
    setNewImages(prev => [...prev, ...toAdd]);

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleRemoveExisting = (imgId: number) => {
    setImagesToDelete(prev => [...prev, imgId]);
    setExistingImages(prev => prev.filter(img => img.id !== imgId));
  };

  const handleRemoveNew = (index: number) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit: any = { ...formData };

    if (!dataToSubmit.placa || dataToSubmit.placa.trim() === '') dataToSubmit.placa = null;
    if (!dataToSubmit.chasis || dataToSubmit.chasis.trim() === '') dataToSubmit.chasis = null;
    if (!dataToSubmit.año || dataToSubmit.año.trim() === '') {
      dataToSubmit.año = null;
    } else {
      dataToSubmit.año = Number(dataToSubmit.año);
    }

    onSubmit(dataToSubmit, newImages, imagesToDelete);
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('vehiculos').getPublicUrl(path);
    return data.publicUrl;
  };

  const currentCount = existingImages.length + newImages.length;
  const canAddMore = currentCount < 5;

  return (
    <>
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
            allowClear={true}
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

        {/* SECCIÓN DE IMÁGENES */}
        <div className="form-group">
          <label className="form-label">
            Fotos del Vehículo (Máximo 5) — {currentCount}/5
          </label>

          <div className="vehicle-images-grid">
            {existingImages.map((img) => (
              <div
                key={img.id}
                className="vehicle-image-preview"
                onClick={() => setLightboxImage(getPublicUrl(img.storage_path))}
              >
                <img src={getPublicUrl(img.storage_path)} alt="Vehículo" />
                <button
                  type="button"
                  className="vehicle-image-remove"
                  onClick={(e) => { e.stopPropagation(); handleRemoveExisting(img.id); }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {newImages.map((file, index) => (
              <div
                key={index}
                className="vehicle-image-preview"
                onClick={() => setLightboxImage(URL.createObjectURL(file))}
              >
                <img src={URL.createObjectURL(file)} alt="Preview" />
                <button
                  type="button"
                  className="vehicle-image-remove"
                  onClick={(e) => { e.stopPropagation(); handleRemoveNew(index); }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {canAddMore && (
            <div className="vehicle-image-actions">
              <button type="button" className="vehicle-action-btn" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} /> Subir Archivos
              </button>
              <button type="button" className="vehicle-action-btn" onClick={() => cameraInputRef.current?.click()}>
                <Camera size={16} /> Tomar Foto
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {currentCount === 0 && (
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ImageIcon size={12} /> Opcional — Puedes agregar hasta 5 fotos del vehículo
            </p>
          )}
        </div>

        <button type="submit" className="btn-submit">
          {initialValues ? 'Guardar Cambios' : 'Agregar Vehículo'}
        </button>
      </form>

      {/* MODAL VISOR DE IMAGEN UsANDO PORTAL */}
      {lightboxImage && createPortal(
        <div className="modal-overlay" onClick={() => setLightboxImage(null)} style={{ padding: '1rem', zIndex: 9999 }}>
          <img
            src={lightboxImage}
            alt="Vista completa"
            className="image-lightbox"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="btn-icon danger"
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '0.5rem', borderRadius: '50%' }}
            onClick={() => setLightboxImage(null)}
          >
            <X size={24} />
          </button>
        </div>,
        document.body // <-- AQUÍ SE RENDERIZA FUERA DEL DRAWER
      )}
    </>
  );
};

export default VehicleForm;
