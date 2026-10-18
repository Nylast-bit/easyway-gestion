import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import MainLayout from '../layouts/MainLayout';
import { Proveedores } from './proveedores';
import '../styles/global.css';

// oxlint-disable-next-line react/only-export-components -- exportación requerida por Next.js App Router
export const metadata: Metadata = { title: 'Easyway GPS Gestión', description: 'Gestión de instalaciones e inventario GPS' };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="es"><body><Proveedores><MainLayout>{children}</MainLayout></Proveedores></body></html>;
}
