'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Wrench, Car, Satellite, Cpu, ClipboardList, LayoutDashboard, Search } from 'lucide-react';
import GlobalSearch from '../components/GlobalSearch';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/technicians', icon: Wrench, label: 'Técnicos' },
  { to: '/vehicles', icon: Car, label: 'Vehículos' },
  { to: '/gps', icon: Satellite, label: 'GPS' },
  { to: '/simcards', icon: Cpu, label: 'Simcards' },
  { to: '/installations', icon: ClipboardList, label: 'Instalaciones' },
];

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Intercepta las teclas para abrir la búsqueda con Ctrl+K o Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); // ¡Evita que el navegador abra su propia búsqueda!
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        {navItems.map((item, index) => (
          <Link
            key={index}
            href={item.to}
            aria-label={item.label}
            aria-current={pathname === item.to ? 'page' : undefined}
            className={`sidebar-icon ${pathname === item.to ? 'active' : ''}`}
          >
            <item.icon size={24} />
            <span className="tooltip">{item.label}</span>
          </Link>
        ))}
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div className="global-search" onClick={() => setIsSearchOpen(true)}>
            <Search size={18} />
            <span>Buscar... (Ctrl + K)</span>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e5e7eb' }}></div>
        </header>

        <main className="page-area">
          {children}
        </main>
      </div>

      {/* Modal de Búsqueda Global */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
};

export default MainLayout;
