import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Importar from '../pantallas/Importar';
import { respuestaPorDefecto } from './preparacion';

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: avisos, Toaster: () => null }));

const conteo = { clientes: 6, vehiculos: 7, gps: 7, simcards: 7, instalaciones: 11, tecnicos: 6, planes: 4, tipos_servicio: 0, servicios: 3, asignaciones_gps: 8, asignaciones_sim: 7 };
const resumen = {
  archivo: 'Control.xlsx', hoja: 'Data de instalaciones e cliente', filas: 14, filas_validas: 11, filas_con_error: 2, filas_con_advertencia: 4, filas_omitidas: 1,
  nuevos: conteo, existentes: { clientes: 1, vehiculos: 0, gps: 0, simcards: 0 },
  tecnicos: [
    { clave: 'gabo chamo', texto: 'Gabo Chamo', filas: 2, sugerencia: { accion: 'crear', nombre: 'Gabo Chamo' } },
    { clave: 'gabo', texto: 'Gabo', filas: 1, sugerencia: { accion: 'crear', nombre: 'Gabo' } },
  ],
  planes: [{ clave: 'plan anual', texto: 'Plan Anual', filas: 3, sugerencia: { accion: 'existente', id: 1 } }],
  tipos: [{ clave: 'instalacion', texto: 'Instalación', filas: 8, sugerencia: { accion: 'existente', id: 1 } }],
};
const opciones = {
  tecnicos: { 'gabo chamo': { accion: 'crear', nombre: 'Gabo Chamo' }, gabo: { accion: 'crear', nombre: 'Gabo' } },
  planes: { 'plan anual': { accion: 'existente', id: 1 } }, tipos: { instalacion: { accion: 'existente', id: 1 } }, crear_servicios: true,
};
const importacion = { id: 4, archivo_nombre: 'Control.xlsx', estado: 'Analizada', resumen, opciones, creado_por_nombre: 'Ana', created_at: '2026-10-18T12:00:00Z', confirmada_at: null, revertida_at: null };

function simularApi(rutas: Record<string, (cuerpo: unknown) => Response>) {
  const llamadas: { url: string; metodo: string; cuerpo: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opcionesFetch?: RequestInit) => {
    const metodo = opcionesFetch?.method ?? 'GET';
    const cuerpo = opcionesFetch?.body instanceof FormData ? opcionesFetch.body : opcionesFetch?.body ? JSON.parse(String(opcionesFetch.body)) : undefined;
    llamadas.push({ url, metodo, cuerpo });
    return rutas[`${metodo} ${url}`]?.(cuerpo) ?? respuestaPorDefecto(url);
  }));
  return llamadas;
}

test('importar: analiza el archivo, une alias de técnicos con vista previa y confirma con las decisiones', async () => {
  const llamadas = simularApi({
    'POST /api/importaciones': () => Response.json(importacion, { status: 201 }),
    'GET /api/importaciones/4/filas?filtro=problemas': () => Response.json([
      { id: 1, hoja: 'Data', fila: 16, datos: null, advertencias: [], errores: ['Fila sin IMEI'] },
    ]),
    'POST /api/importaciones/4/previsualizar': () => Response.json({ ...resumen, nuevos: { ...conteo, tecnicos: 5 } }),
    'POST /api/importaciones/4/confirmar': () => Response.json({ ...importacion, estado: 'Confirmada' }),
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<Importar />);
  const archivo = new File(['xlsx'], 'Control.xlsx');
  fireEvent.change(screen.getByTestId('archivo-excel'), { target: { files: [archivo] } });
  expect(await screen.findByText('Control.xlsx', { selector: 'h2' })).toBeInTheDocument();
  expect(llamadas.find(l => l.url === '/api/importaciones' && l.metodo === 'POST')!.cuerpo).toBeInstanceOf(FormData);
  expect(screen.getByText('Fila sin IMEI')).toHaveClass('importacion-error');
  expect(screen.getByText('Clientes · 1 ya existían')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/^Gabo\s*1 fila/), { target: { value: 'crear:Gabo Chamo' } });
  await waitFor(() => expect(llamadas.some(l => l.url.endsWith('/previsualizar'))).toBe(true));
  expect((llamadas.find(l => l.url.endsWith('/previsualizar'))!.cuerpo as typeof opciones).tecnicos.gabo).toEqual({ accion: 'crear', nombre: 'Gabo Chamo' });

  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));
  await waitFor(() => expect(llamadas.some(l => l.url.endsWith('/confirmar'))).toBe(true));
  expect((llamadas.find(l => l.url.endsWith('/confirmar'))!.cuerpo as typeof opciones).tecnicos.gabo).toEqual({ accion: 'crear', nombre: 'Gabo Chamo' });
  expect(await screen.findByRole('button', { name: /Revertir importación/ })).toBeInTheDocument();
});
