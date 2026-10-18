import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children }) => {
  // Estado local para manejar la animación de salida sin que parpadee el fondo
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    }
  }, [isOpen]);

  // Función que se ejecuta al terminar la animación de cerrar
  const handleTransitionEnd = () => {
    if (!isOpen) {
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay de fondo */}
      <div
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* Panel Lateral */}
      <div
        className={`drawer-panel ${isOpen ? 'open' : ''}`}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="drawer-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700' }}>{title}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="drawer-content">
          {children}
        </div>
      </div>
    </>
  );
};

export default Drawer;
