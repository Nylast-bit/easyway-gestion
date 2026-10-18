import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

import { enrutador } from './enrutador';

afterEach(cleanup);
// Sin red: por defecto la API responde con una sesión de administrador; cada prueba puede sustituirlo.
beforeEach(() => {
  enrutador.push.mockReset();
  enrutador.replace.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    usuario: { id: 1, nombre: 'Ana Admin', usuario: 'admin', correo: null, rol: 'admin', tecnico_id: null },
  })));
});
vi.mock('next/navigation', async () => {
  const { enrutador } = await import('./enrutador');
  return { usePathname: () => '/', useRouter: () => enrutador };
});
vi.mock('../lib/supabaseClient', () => {
  const respuesta = { data: [], error: null, count: 0 };
  const consulta: Record<string, unknown> = {};
  for (const metodo of ['select', 'order', 'eq', 'is', 'limit', 'ilike', 'gte', 'lte', 'single']) {
    consulta[metodo] = () => consulta;
  }
  consulta.then = (resolver: (valor: typeof respuesta) => unknown) => Promise.resolve(respuesta).then(resolver);
  return { configuracionPublicaDisponible: true, supabase: { from: vi.fn(() => consulta) } };
});
