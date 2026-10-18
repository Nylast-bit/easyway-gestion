'use client';

import { Toaster } from 'react-hot-toast';
import type { ReactNode } from 'react';

export function Proveedores({ children }: { children: ReactNode }) {
  return <><Toaster position="bottom-right" />{children}</>;
}
