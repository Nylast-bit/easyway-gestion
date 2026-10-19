import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, MoreVertical, Share, SquarePlus } from 'lucide-react';
import Drawer from './Drawer';
import { instalarApp, useEstadoInstalacion } from '../lib/pwa';

// "Descargar app": instala el portal como aplicación (PWA) en el teléfono del técnico.
// Con el diálogo nativo disponible (Android/Chrome) lo abre; en iPhone y otros navegadores explica los pasos.
const BotonInstalar: React.FC = () => {
  const estado = useEstadoInstalacion();
  const [ayuda, setAyuda] = useState(false);
  if (estado === 'instalada') return null;

  const pulsar = async () => {
    if (estado !== 'disponible') return setAyuda(true);
    if (await instalarApp()) toast.success('App instalada: búscala en tu pantalla de inicio');
  };
  const seguro = typeof window === 'undefined' || window.isSecureContext;

  return (
    <>
      <button type="button" className="btn-instalar" onClick={pulsar}><Download size={18} /> Descargar app</button>
      <Drawer isOpen={ayuda} onClose={() => setAyuda(false)} title="Instalar la app">
        <div className="instalar-ayuda">
          <img src="/iconos/icono-192.png" alt="" width={64} height={64} />
          <p>Instala <strong>Easyway GPS</strong> en tu teléfono para abrirla desde la pantalla de inicio, a pantalla completa, y registrar tus trabajos más rápido.</p>
          {estado === 'ios' ? (
            <ol>
              <li>Abre esta página en <strong>Safari</strong>.</li>
              <li>Toca <Share size={16} aria-label="Compartir" /> <strong>Compartir</strong> en la barra inferior.</li>
              <li>Elige <SquarePlus size={16} aria-hidden="true" /> <strong>Añadir a pantalla de inicio</strong> y luego <strong>Añadir</strong>.</li>
            </ol>
          ) : (
            <ol>
              <li>Abre esta página en <strong>Chrome</strong> (Android) o en Edge.</li>
              <li>Toca el menú <MoreVertical size={16} aria-label="Menú" /> del navegador.</li>
              <li>Elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.</li>
            </ol>
          )}
          {!seguro && <p className="instalar-aviso">Para instalarla, entra por la dirección segura del portal (https://…). En una dirección de red local sin https el navegador no permite instalar.</p>}
        </div>
      </Drawer>
    </>
  );
};

export default BotonInstalar;
