import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import MainLayout from '../layouts/MainLayout';
import Installations from '../pantallas/Installations';
import GaleriaFotos from '../components/GaleriaFotos';
import { ContextoSesion } from '../lib/sesion';
import { enrutador } from './enrutador';
import { respuestaPorDefecto } from './preparacion';

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: avisos, Toaster: () => null }));

const tecnico = { id: 5, nombre: 'Pedro Técnico', usuario: 'pedro', correo: null, rol: 'tecnico' as const, tecnico_id: 2 };
const instalacion = {
  id: 9, vehiculo_id: 7, gps_id: 11, simcard_id: null, tecnico_id: 2, fecha_instalacion: '2026-10-18T16:30:00.000Z',
  tipo: 'Instalación', asunto: 'Nueva unidad', notas: null, estado: 'En Proceso', created_at: '',
  vehiculo: { marca: 'TOYOTA', modelo: 'HILUX', placa: 'L123456', cliente_id: 3, cliente_nombre: 'Transporte Caribe' },
  gps_imei: '863829070755440', simcard_numero: null, tecnico_nombre: 'Pedro',
};

function simularApi(rutas: Record<string, () => Response>) {
  const llamadas: { url: string; metodo: string; cuerpo: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET';
    llamadas.push({ url, metodo, cuerpo: opciones?.body });
    return rutas[`${metodo} ${url}`]?.() ?? respuestaPorDefecto(url);
  }));
  return llamadas;
}

test('un técnico solo ve Instalaciones en el menú y se le redirige desde rutas de administración', async () => {
  simularApi({ 'GET /api/auth/sesion': () => Response.json({ usuario: tecnico }) });
  render(<MainLayout><h1>Dashboard</h1></MainLayout>);
  await waitFor(() => expect(enrutador.replace).toHaveBeenCalledWith('/field'));
  expect(screen.getAllByRole('link').map(l => l.getAttribute('aria-label'))).toEqual(['Instalaciones', 'Trabajo de campo']);
  // El contenido de administración no llega a montarse (no hace peticiones que darían 403).
  expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Buscar\.\.\./)).not.toBeInTheDocument();
});

test('instalaciones como técnico: sin alta ni borrado, el lápiz envía solo el avance', async () => {
  const llamadas = simularApi({
    'GET /api/instalaciones': () => Response.json([instalacion]),
    'PATCH /api/instalaciones/9/avance': () => Response.json({ ...instalacion, estado: 'Completado' }),
  });
  render(<ContextoSesion.Provider value={tecnico}><Installations /></ContextoSesion.Provider>);
  expect(await screen.findByRole('heading', { name: 'Mis instalaciones' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar instalación' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Actualizar avance' }));
  fireEvent.change(screen.getByLabelText('Estado', { selector: '#avance-estado' }), { target: { value: 'Completado' } });
  fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'Probado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar avance' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'PATCH')).toBeDefined());
  expect(JSON.parse(String(llamadas.find(l => l.metodo === 'PATCH')!.cuerpo))).toEqual({ estado: 'Completado', notas: 'Probado' });
});

test('galería: muestra URLs temporales, permite borrar solo las propias y sube como multipart', async () => {
  avisos.error.mockReset();
  const llamadas = simularApi({
    'GET /api/fotos?vehiculo_id=7': () => Response.json([
      { id: 1, url: '/api/archivos/a.firma', created_at: '', propia: true, autor: 'Pedro' },
      { id: 2, url: '/api/archivos/b.firma', created_at: '', propia: false, autor: 'Otro' },
    ]),
    'POST /api/fotos': () => Response.json({ id: 3, url: '/api/archivos/c.firma', created_at: '', propia: true, autor: 'Pedro' }, { status: 201 }),
  });
  render(<GaleriaFotos vehiculoId={7} />);
  expect(await screen.findByAltText('Foto del vehículo subida por Pedro')).toHaveAttribute('src', '/api/archivos/a.firma');
  expect(screen.getAllByRole('button', { name: 'Eliminar foto' })).toHaveLength(1);
  expect(screen.getByText('Fotos del vehículo — 2/5')).toBeInTheDocument();

  const entrada = screen.getByTestId('subir-fotos');
  const valida = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'auto.jpg', { type: 'image/jpeg' });
  const invalida = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
  fireEvent.change(entrada, { target: { files: [valida, invalida] } });
  await waitFor(() => expect(screen.getByText('Fotos del vehículo — 3/5')).toBeInTheDocument());
  expect(avisos.error).toHaveBeenCalledWith('x.svg: usa JPG, PNG o WebP');
  const subida = llamadas.filter(l => l.metodo === 'POST');
  expect(subida).toHaveLength(1);
  const formulario = subida[0].cuerpo as FormData;
  expect(formulario.get('vehiculo_id')).toBe('7');
  expect((formulario.get('archivo') as File).name).toBe('auto.jpg');
});
