import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react'; // Importamos el icono X

interface Option {
  id: string | number;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string | number;
  onChange: (id: string | number) => void;
  placeholder?: string;
  allowClear?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder, allowClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => String(opt.id) === String(value));

  useEffect(() => {
    setSearch(selectedOption ? selectedOption.label : '');
  }, [value, selectedOption]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string | number, label: string) => {
    onChange(id);
    setSearch(label);
    setIsOpen(false);
  };

  // Función para limpiar el campo
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  return (
    <div className="searchable-container" ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        className="form-input"
        value={search}
        placeholder={placeholder || "Buscar..."}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        style={{ paddingRight: allowClear && value ? '2.5rem' : '1rem' }}
      />

      {/* Botón de limpiar (X) */}
      {allowClear && value && (
        <button
          type="button"
          onClick={handleClear}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6b7280'
          }}
        >
          <X size={16} />
        </button>
      )}

      {isOpen && (
        <div className="searchable-dropdown">
          {filteredOptions.length === 0 ? (
            <div className="searchable-option no-results">No se encontraron resultados</div>
          ) : (
            filteredOptions.map(opt => (
              <div
                key={opt.id}
                className="searchable-option"
                onClick={() => handleSelect(opt.id, opt.label)}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
