import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { fechaEnRD, rangoPeriodo } from '@easyway/shared';
import Installations from '../pantallas/Installations';
import { ContextoSesion } from '../lib/sesion';
import { respuestaPorDefecto } from './preparacion';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() }, Toaster: () => null }));

const admin = { id: 1, nombre: 'Ana', usuario: 'admin', correo: null, rol: 'admin' as const, tecnico_id: null };

test('filtros: el periodo y el técnico viajan a la API y el resumen permite filtrar por técnico', async () => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    if (url.startsWith('/api/instalaciones/resumen')) return Response.json({
      total: 297, por_tecnico: [{ tecnico_id: 1, nombre: 'Eliezer', total: 275 }, { tecnico_id: 2, nombre: 'Gabo Chamo', total: 22 }],
      por_tipo: [{ tipo_servicio_id: 1, nombre: 'Instalación', total: 250 }, { tipo_servicio_id: 2, nombre: 'Venta', total: 47 }],
    });
    if (url === '/api/tecnicos') return Response.json([{ id: 1, nombre: 'Eliezer' }, { id: 2, nombre: 'Gabo Chamo' }]);
    return respuestaPorDefecto(url);
  }));
  render(<ContextoSesion.Provider value={admin}><Installations /></ContextoSesion.Provider>);
  expect(await screen.findByText('297 instalaciones')).toBeInTheDocument();
  expect(screen.getByText('Instalación: 250 · Venta: 47')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Periodo'), { target: { value: 'mes' } });
  const { desde, hasta } = rangoPeriodo('mes', fechaEnRD());
  await waitFor(() => expect(urls).toContain(`/api/instalaciones?desde=${desde}&hasta=${hasta}`));

  fireEvent.click(screen.getByRole('button', { name: /Gabo Chamo/ }));
  await waitFor(() => expect(urls).toContain(`/api/instalaciones/resumen?desde=${desde}&hasta=${hasta}&tecnico=2`));
  expect(screen.getByRole('button', { name: /Gabo Chamo/ })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
  await waitFor(() => expect(urls[urls.length - 1]).toBe('/api/instalaciones/resumen'));
});
