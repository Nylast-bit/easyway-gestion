'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, Wrench, Car, Satellite, Cpu, ClipboardList, LayoutDashboard, Search, LogOut, UserCog, Receipt, CalendarClock, FileUp, Smartphone, ClipboardCheck, HandCoins } from 'lucide-react';
import toast from 'react-hot-toast';
import type { UsuarioSesion } from '@easyway/shared';
import GlobalSearch from '../components/GlobalSearch';
import { ErrorApi, solicitarApi } from '../lib/api';
import { ContextoSesion, RUTAS_TECNICO } from '../lib/sesion';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/technicians', icon: Wrench, label: 'Técnicos' },
  { to: '/vehicles', icon: Car, label: 'Vehículos' },
  { to: '/gps', icon: Satellite, label: 'GPS' },
  { to: '/simcards', icon: Cpu, label: 'Simcards' },
  { to: '/installations', icon: ClipboardList, label: 'Instalaciones' },
  { to: '/field', icon: Smartphone, label: 'Trabajo de campo' },
  { to: '/approvals', icon: ClipboardCheck, label: 'Aprobaciones' },
  { to: '/technician-costs', icon: HandCoins, label: 'Costos técnicos' },
  { to: '/billing', icon: Receipt, label: 'Cobros' },
  { to: '/expirations', icon: CalendarClock, label: 'Vencimientos' },
  { to: '/import', icon: FileUp, label: 'Importar' },
  { to: '/users', icon: UserCog, label: 'Usuarios' },
];

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);

  // La API decide si la sesión es válida; con 401 (cookie caducada) se vuelve al login.
  useEffect(() => {
    let activo = true;
    solicitarApi<{ usuario: UsuarioSesion }>('/auth/sesion')
      .then(datos => { if (activo) setUsuario(datos.usuario); })
      .catch(error => {
        if (!activo) return;
        if (error instanceof ErrorApi && error.estado === 401) router.replace(`/login?siguiente=${encodeURIComponent(pathname ?? '/')}`);
        else toast.error(error instanceof ErrorApi ? error.message : 'No se pudo comprobar la sesión');
      });
    return () => { activo = false; };
  }, [router, pathname]);

  // Un técnico solo usa sus instalaciones; las rutas de administración responderían 403.
  const esTecnico = usuario?.rol === 'tecnico';
  const rutaPermitida = !esTecnico || RUTAS_TECNICO.includes(pathname ?? '/');
  useEffect(() => {
    if (usuario && !rutaPermitida) router.replace(RUTAS_TECNICO[0]);
  }, [usuario, rutaPermitida, router]);
  const elementos = esTecnico ? navItems.filter(item => RUTAS_TECNICO.includes(item.to)) : navItems.filter(item => item.to !== '/field');

  const cerrarSesion = async () => {
    try { await solicitarApi('/auth/logout', { metodo: 'POST' }); }
    catch { toast.error('No se pudo cerrar la sesión en el servidor'); }
    router.replace('/login');
  };

  const esTecnicoRef = React.useRef(false);
  esTecnicoRef.current = esTecnico;

  // Intercepta las teclas para abrir la búsqueda con Ctrl+K o Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !esTecnicoRef.current) {
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
        {usuario && elementos.map((item, index) => (
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
          {esTecnico ? <div /> : (
            <div className="global-search" onClick={() => setIsSearchOpen(true)}>
              <Search size={18} />
              <span>Buscar... (Ctrl + K)</span>
            </div>
          )}
          <div className="cabecera-usuario">
            <div className="cabecera-nombre">
              <span>{usuario?.nombre ?? ' '}</span>
              <small>{usuario ? (usuario.rol === 'admin' ? 'Administrador' : 'Técnico') : ''}</small>
            </div>
            <div className="cabecera-avatar" aria-hidden="true">{usuario?.nombre.charAt(0).toUpperCase()}</div>
            <button type="button" className="cabecera-salir" onClick={cerrarSesion} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="page-area">
          {/* El contenido espera a conocer la sesión: evita peticiones con permisos que no corresponden. */}
          {usuario && rutaPermitida && <ContextoSesion.Provider value={usuario}>{children}</ContextoSesion.Provider>}
        </main>
      </div>

      {/* Modal de Búsqueda Global */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
};

export default MainLayout;
