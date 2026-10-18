'use client';

import type { ComponentType } from 'react';
import { configuracionPublicaDisponible } from '../lib/supabaseClient';

export function PaginaActual({ componente: Componente, titulo }: { componente: ComponentType; titulo: string }) {
  if (!configuracionPublicaDisponible) return <section>
    <h1>{titulo}</h1>
    <p role="status">Conexión de datos pendiente: el backend se incorporará en la fase 3.</p>
    <p>La navegación está disponible. La base nueva mantiene bloqueado el acceso público.</p>
  </section>;
  return <Componente />;
}
