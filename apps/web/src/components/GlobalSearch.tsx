import React, { useState, useEffect } from 'react';
import type { ResultadoBusqueda } from '@easyway/shared';
import { solicitarApi } from '../lib/api';
import { useRouter } from 'next/navigation';
import { Search, Users, Car, Satellite } from 'lucide-react';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ type: string; label: string; icon: typeof Users; path: string }[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (search.trim().length > 0) {
      const fetchData = async () => {
        const datos = await solicitarApi<ResultadoBusqueda[]>(`/buscar?q=${encodeURIComponent(search.trim())}`).catch(() => []);
        const destinos = {
          cliente: { type: 'Cliente', icon: Users, path: '/clients' },
          vehiculo: { type: 'Vehículo', icon: Car, path: '/vehicles' },
          gps: { type: 'GPS', icon: Satellite, path: '/gps' },
        };
        setResults(datos.map(r => ({ ...destinos[r.tipo], label: r.etiqueta })));
      };
      const timer = setTimeout(fetchData, 300); // Debounce para no saturar la BD
      return () => clearTimeout(timer);
    } else {
      setResults([]);
    }
  }, [search]);

  if (!isOpen) return null;

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
    setSearch('');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div className="modal-box" style={{ width: '100%', maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
          <Search size={20} color="#6b7280" />
          <input
            type="text"
            autoFocus
            placeholder="Buscar clientes, vehículos o GPS..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', outline: 'none', fontSize: '1rem', width: '100%' }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>Esc</button>
        </div>

        <div style={{ marginTop: '1rem' }}>
          {results.length === 0 && search.length > 0 && <p style={{ color: '#6b7280', textAlign: 'center' }}>Sin resultados</p>}
          {results.map((res, index) => (
            <div
              key={index}
              onClick={() => handleNavigate(res.path)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer' }}
              className="searchable-option"
            >
              <res.icon size={18} color="#00b494" />
              <div>
                <div style={{ fontWeight: '500' }}>{res.label}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{res.type}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
