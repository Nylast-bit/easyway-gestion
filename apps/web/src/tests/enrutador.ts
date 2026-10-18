import { vi } from 'vitest';

// Enrutador simulado compartido por preparacion.ts y las pruebas que comprueban redirecciones.
export const enrutador = { push: vi.fn(), replace: vi.fn() };
