import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Clients from '../pantallas/Clients';
import Vehicles from '../pantallas/Vehicles';
import Gps from '../pantallas/Gps';
import Installations from '../pantallas/Installations';
import { respuestaPorDefecto } from './preparacion';

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: avisos, Toaster: () => null }));

type Llamada = { url: string; metodo: string; cuerpo: unknown };

// Simula la API por método y ruta; registra cada llamada con su cuerpo JSON.
function simularApi(rutas: Record<string, () => Response>) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET';
    llamadas.push({ url, metodo, cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : undefined });
    return rutas[`${metodo} ${url}`]?.() ?? respuestaPorDefecto(url);
  }));
  return llamadas;
}

const vehiculo = {
  id: 7, cliente_id: 3, cliente_nombre: 'Transporte Caribe', marca: 'TOYOTA', modelo: 'HILUX', año: 2022,
  placa: 'L123456', chasis: null, color: 'BLANCO', gps: { id: 11, imei: '863829070755440', modelo: 'FMB920' }, imagenes: 0, created_at: '2026-10-01T00:00:00Z',
};

test('clientes: lista desde la API, crea con POST y muestra el error de negocio al borrar', async () => {
  avisos.error.mockReset();
  const llamadas = simularApi({
    'GET /api/clientes': () => Response.json([{ id: 3, nombre: 'Transporte Caribe', telefono: '8095550101', correo: null, created_at: '2026-10-01T00:00:00Z' }]),
    'POST /api/clientes': () => Response.json({ id: 4 }, { status: 201 }),
    'DELETE /api/clientes/3': () => Response.json({ error: 'No se puede completar: el registro está relacionado con otros datos' }, { status: 409 }),
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<Clients />);
  expect(await screen.findByText('Transporte Caribe')).toBeInTheDocument();
  expect(screen.getByText(/Sin correo/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Transporte Caribe' }));
  await waitFor(() => expect(avisos.error).toHaveBeenCalledWith(expect.stringContaining('relacionado')));

  fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
  fireEvent.change(screen.getByLabelText('Nombre Completo *'), { target: { value: 'Flota Norte' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar Cliente' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'POST')?.cuerpo).toEqual({ nombre: 'Flota Norte', telefono: '', correo: '' }));
});

test('vehículos: al editar conserva el GPS instalado y envía todo en un PUT', async () => {
  const llamadas = simularApi({
    'GET /api/vehiculos': () => Response.json([vehiculo]),
    'GET /api/clientes': () => Response.json([{ id: 3, nombre: 'Transporte Caribe', telefono: null, correo: null, created_at: '' }]),
    'PUT /api/vehiculos/7': () => Response.json(vehiculo),
  });
  render(<Vehicles />);
  expect(await screen.findByText('GPS: 863829070755440')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar vehículo' }));
  fireEvent.change(screen.getByLabelText('Color'), { target: { value: 'rojo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'PUT')?.cuerpo).toMatchObject({ cliente_id: 3, gps_id: 11, color: 'ROJO', placa: 'L123456' }));
  expect(llamadas.some(l => l.url === '/api/gps?estado=Disponible')).toBe(true);
});

test('GPS: muestra simcard y vehículo activos y avisa que se retirará al cambiar de estado', async () => {
  simularApi({
    'GET /api/gps': () => Response.json([{
      id: 11, imei: '863829070755440', modelo: 'FMB920', estado: 'Instalado', created_at: '',
      simcard: { id: 5, numero: '8091802704' }, vehiculo: { id: 7, marca: 'TOYOTA', modelo: 'HILUX', placa: 'L123456' },
    }]),
  });
  render(<Gps />);
  expect(await screen.findByText('SIM: 8091802704')).toBeInTheDocument();
  expect(screen.getByText('Veh: TOYOTA HILUX (L123456)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar GPS' }));
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'Dañado' } });
  expect(screen.getByText(/se retirará del vehículo L123456/)).toBeInTheDocument();
});

test('instalaciones: envía la fecha local como instante ISO', async () => {
  const instalacion = {
    id: 9, vehiculo_id: 7, gps_id: 11, simcard_id: null, tecnico_id: null, fecha_instalacion: '2026-10-18T16:30:00.000Z',
    tipo: 'Instalación', asunto: 'Nueva unidad', notas: null, estado: 'En Proceso', created_at: '',
    vehiculo: { marca: 'TOYOTA', modelo: 'HILUX', placa: 'L123456', cliente_id: 3, cliente_nombre: 'Transporte Caribe' },
    gps_imei: '863829070755440', simcard_numero: null, tecnico_nombre: null,
  };
  const llamadas = simularApi({
    'GET /api/instalaciones': () => Response.json([instalacion]),
    'PUT /api/instalaciones/9': () => Response.json(instalacion),
  });
  render(<Installations />);
  expect(await screen.findByText('Instalación: Nueva unidad')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar instalación' }));
  fireEvent.change(screen.getByLabelText('Fecha y Hora *'), { target: { value: '2026-10-19T08:15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'PUT')).toBeDefined());
  const cuerpo = llamadas.find(l => l.metodo === 'PUT')!.cuerpo as Record<string, unknown>;
  expect(cuerpo).toMatchObject({ vehiculo_id: 7, gps_id: 11, simcard_id: '', estado: 'En Proceso' });
  expect(cuerpo.fecha_instalacion).toBe(new Date('2026-10-19T08:15').toISOString());
});
