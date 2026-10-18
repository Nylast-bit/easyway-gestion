import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { enrutador } from './enrutador';

afterEach(cleanup);

// API simulada sin red: sesión de administrador, resumen vacío y listas vacías.
// Cada prueba puede sustituir fetch con vi.stubGlobal para respuestas concretas.
export function respuestaPorDefecto(url: string) {
  if (url === '/api/auth/sesion') {
    return Response.json({ usuario: { id: 1, nombre: 'Ana Admin', usuario: 'admin', correo: null, rol: 'admin', tecnico_id: null } });
  }
  if (url === '/api/resumen') return Response.json({ clientes: 0, vehiculos: 0, gps: 0, simcards: 0 });
  if (url.startsWith('/api/instalaciones/resumen')) return Response.json({ total: 0, por_tecnico: [], por_tipo: [] });
  return Response.json([]);
}

beforeEach(() => {
  enrutador.push.mockReset();
  enrutador.replace.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => respuestaPorDefecto(url)));
});

vi.mock('next/navigation', async () => {
  const { enrutador } = await import('./enrutador');
  return { usePathname: () => '/', useRouter: () => enrutador };
});
