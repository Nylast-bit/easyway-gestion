'use client';

import { Toaster } from 'react-hot-toast';
import { useEffect, type ReactNode } from 'react';
import { registrarServiceWorker } from '../lib/pwa';

export function Proveedores({ children }: { children: ReactNode }) {
  useEffect(() => { registrarServiceWorker(); }, []);
  return <><Toaster position="bottom-right" />{children}</>;
}
