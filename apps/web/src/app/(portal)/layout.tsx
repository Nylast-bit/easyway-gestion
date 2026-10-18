import type { ReactNode } from 'react';
import MainLayout from '../../layouts/MainLayout';

// Rutas del portal: requieren sesión (proxy.ts redirige sin cookie y MainLayout valida con la API).
export default function LayoutPortal({ children }: { children: ReactNode }) {
  return <MainLayout>{children}</MainLayout>;
}
