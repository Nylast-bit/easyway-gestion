import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../lib/supabaseClient', () => {
  const respuesta = { data: [], error: null, count: 0 };
  const consulta: Record<string, unknown> = {};
  for (const metodo of ['select', 'order', 'eq', 'is', 'limit', 'ilike', 'gte', 'lte', 'single']) {
    consulta[metodo] = () => consulta;
  }
  consulta.then = (resolver: (valor: typeof respuesta) => unknown) => Promise.resolve(respuesta).then(resolver);
  return { configuracionPublicaDisponible: true, supabase: { from: vi.fn(() => consulta) } };
});
