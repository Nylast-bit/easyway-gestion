import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { guardarBorrador, listarBorradores, type Borrador } from '../lib/colaCampo';

// Carga public/sw.js con un `self` simulado para probar sus manejadores sin navegador.
function cargarServiceWorker(opciones: { ventanas: { postMessage: (m: unknown) => void }[]; fetch: typeof fetch }) {
  const manejadores: Record<string, (evento: unknown) => void> = {};
  const self = {
    addEventListener: (tipo: string, manejador: (evento: unknown) => void) => { manejadores[tipo] = manejador; },
    clients: { matchAll: async () => opciones.ventanas, claim: async () => {} },
    location: { origin: 'http://localhost' },
  };
  new Function('self', 'fetch', 'caches', readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8'))(self, opciones.fetch, {});
  const sync = async (tag: string) => {
    let espera: Promise<unknown> = Promise.resolve();
    manejadores.sync({ tag, waitUntil: (p: Promise<unknown>) => { espera = p; } });
    return espera;
  };
  return { manejadores, sync };
}

const borrador = (clave: string, extra: Partial<Borrador> = {}): Borrador => ({
  clave, usuario_id: 7, creado: new Date().toISOString(), trabajo_id: null, fotos_fallidas: 0, error: null,
  fotos: [{ nombre: 'tablero.jpg', tipo: 'image/jpeg', datos: new Uint8Array([255, 216, 255]).buffer }],
  cuerpo: { imei: '863829070000001', clave_idempotencia: clave }, resumen: { tipo: 'Instalación', cliente: 'C', vehiculo: 'V', imei: '863829070000001', fecha: null },
  ...extra,
});

test('sw.js: no intercepta /api y, con la app abierta, solo avisa a la página', async () => {
  const ventana = { postMessage: vi.fn() };
  const red = vi.fn<typeof fetch>();
  const { manejadores, sync } = cargarServiceWorker({ ventanas: [ventana], fetch: red });
  const respondWith = vi.fn();
  manejadores.fetch({ request: { method: 'GET', url: 'http://localhost/api/campo/trabajos', mode: 'cors' }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();

  await sync('easyway-cola-campo');
  expect(ventana.postMessage).toHaveBeenCalledWith({ tipo: 'easyway-cola-campo' });
  expect(red).not.toHaveBeenCalled();
});

test('sw.js: con la app cerrada envía trabajo y fotos de la cuenta con sesión; sin señal lanza para reintentar', async () => {
  await guardarBorrador(borrador('33333333-3333-4333-8333-333333333333'));
  await guardarBorrador(borrador('44444444-4444-4444-8444-444444444444', { usuario_id: 99 }));
  const llamadas: string[] = [];
  let senal = false;
  const red = vi.fn(async (url: string, opciones?: RequestInit) => {
    if (!senal) throw new TypeError('Failed to fetch');
    llamadas.push(`${opciones?.method ?? 'GET'} ${url}`);
    if (url === '/api/auth/sesion') return Response.json({ usuario: { id: 7 } });
    if (url === '/api/campo/trabajos') return Response.json({ id: 21 }, { status: 201 });
    return Response.json({ id: 1 }, { status: 201 });
  }) as unknown as typeof fetch;
  const { sync } = cargarServiceWorker({ ventanas: [], fetch: red });

  await expect(sync('easyway-cola-campo')).rejects.toThrow();
  expect(await listarBorradores(7)).toHaveLength(1);

  senal = true;
  await sync('easyway-cola-campo');
  expect(llamadas).toEqual(['GET /api/auth/sesion', 'POST /api/campo/trabajos', 'POST /api/fotos/trabajo/21']);
  expect(await listarBorradores(7)).toEqual([]);
  // El de otra cuenta no se envía con esta sesión.
  expect(await listarBorradores(99)).toHaveLength(1);
});
