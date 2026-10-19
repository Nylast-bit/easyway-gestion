import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Proveedores } from './proveedores';
import '../styles/global.css';

// oxlint-disable-next-line react/only-export-components -- exportación requerida por Next.js App Router
export const metadata: Metadata = {
  title: 'Easyway GPS Gestión',
  description: 'Gestión de instalaciones e inventario GPS',
  applicationName: 'Easyway GPS',
  // Manifiesto estático de la PWA (public/manifest.webmanifest), fuera del proxy de sesión.
  manifest: '/manifest.webmanifest',
  icons: { icon: '/iconos/icono.svg', apple: '/iconos/apple-touch-icon.png' },
  // iOS: al añadirla a la pantalla de inicio se abre sin barra de Safari.
  appleWebApp: { capable: true, title: 'Easyway GPS', statusBarStyle: 'default' },
};

// oxlint-disable-next-line react/only-export-components -- exportación requerida por Next.js App Router
export const viewport: Viewport = { themeColor: '#00b494', width: 'device-width', initialScale: 1 };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="es"><body><Proveedores>{children}</Proveedores></body></html>;
}
