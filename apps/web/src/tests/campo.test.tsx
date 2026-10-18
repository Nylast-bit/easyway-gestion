import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import TrabajoCampo from '../pantallas/TrabajoCampo';
import Aprobaciones from '../pantallas/Aprobaciones';
import CostosTecnicos from '../pantallas/CostosTecnicos';
import { respuestaPorDefecto } from './preparacion';

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: avisos, Toaster: () => null }));

function simularApi(rutas: Record<string, () => Response>) {
  const llamadas: { url: string; metodo: string; cuerpo: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET';
    llamadas.push({ url, metodo, cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : undefined });
    return rutas[`${metodo} ${url}`]?.() ?? respuestaPorDefecto(url);
  }));
  return llamadas;
}
const sinCoincidencias = { clientes: [], vehiculos: [], gps: null, simcard: null };
const trabajoBase = {
  id: 21, aprobacion: 'Pendiente', estado: 'Completado', tipo: 'Instalación', fecha_instalacion: '2026-10-17T14:00:00Z', created_at: '',
  motivo_rechazo: null, notas: 'Bajo el tablero', cliente_nombre: 'Flota del Este SRL · nuevo', vehiculo_descripcion: 'TOYOTA HILUX (L123456) · nuevo',
  imei: '863829070000001', sim: '8095551001', vehiculo_id: null, costo_tecnico: null, costo_pagado_at: null, tecnico_nombre: 'Pedro', registrada_por_nombre: 'pedro',
  propuesta: { cliente_id: null, cliente_nuevo: { nombre: 'Flota del Este SRL', telefono: '8095550101', correo: null, tipo: 'Empresa', documento: null, notas: null },
    vehiculo_nuevo: { marca: 'TOYOTA', modelo: 'HILUX', placa: 'L123456', año: null, chasis: null, color: null, tipo: 'Carro' }, imei: '863829070000001', sim: '8095551001' },
  coincidencias: sinCoincidencias,
};

test('técnico: registra un trabajo con cliente y vehículo nuevos y ve el estado de los suyos', async () => {
  const llamadas = simularApi({
    'GET /api/campo/trabajos': () => Response.json([{ ...trabajoBase, aprobacion: 'Rechazada', motivo_rechazo: 'IMEI ilegible en la foto' }]),
    'GET /api/campo/costos': () => Response.json({ tecnico_id: 2, tecnico_nombre: 'Pedro', trabajos: 3, total: 2200, pagado: 1200, pendiente: 1000 }),
    'GET /api/tipos-servicio?activos=1': () => Response.json([{ id: 1, nombre: 'Instalación', activo: true }]),
    'POST /api/campo/trabajos': () => Response.json(trabajoBase, { status: 201 }),
  });
  render(<TrabajoCampo />);
  expect(await screen.findByText('Rechazado: IMEI ilegible en la foto')).toBeInTheDocument();
  expect(screen.getByText('RD$1,000.00')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Nuevo trabajo/ }));
  await waitFor(() => expect(screen.getByLabelText('Tipo de servicio *')).toHaveValue('1'));
  fireEvent.click(screen.getByRole('button', { name: 'Es un cliente nuevo' }));
  fireEvent.change(screen.getByLabelText('Cliente *'), { target: { value: 'Flota del Este SRL' } });
  fireEvent.change(screen.getByLabelText('Vehículo *'), { target: { value: 'l123456' } });
  fireEvent.change(screen.getByLabelText('IMEI *'), { target: { value: '863829070000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar trabajo' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'POST')).toBeDefined());
  expect(llamadas.find(l => l.metodo === 'POST')!.cuerpo).toMatchObject({
    cliente_id: null, cliente_nuevo: { nombre: 'Flota del Este SRL', tipo: 'Particular' }, vehiculo_id: null,
    vehiculo_nuevo: { placa: 'L123456', tipo: 'Carro' }, imei: '863829070000001', tipo_servicio_id: '1', fecha_instalacion: expect.stringMatching(/Z$/),
  });
});

test('aprobaciones: propone unir el cliente duplicado, avisa del GPS instalado y envía costo y plan', async () => {
  const pendiente = { ...trabajoBase, coincidencias: { clientes: [{ id: 50, nombre: 'FLOTA DEL ESTE' }], vehiculos: [], gps: { id: 9, estado: 'Instalado', vehiculo: 'KIA RIO (A000001)' }, simcard: null } };
  const llamadas = simularApi({
    'GET /api/aprobaciones': () => Response.json([pendiente]),
    'GET /api/planes': () => Response.json([{ id: 1, nombre: 'Plan Anual', periodicidad: 'Anual', precio: 5500, activo: true, servicios_activos: 0 }]),
    'POST /api/aprobaciones/21/aprobar': () => Response.json({ ...pendiente, aprobacion: 'Aprobada' }),
  });
  render(<Aprobaciones />);
  fireEvent.click(await screen.findByRole('button', { name: /Flota del Este SRL/ }));
  expect(screen.getByLabelText('Cliente')).toHaveValue('50');
  expect(screen.getByText(/El GPS ya existe \(Instalado en KIA RIO \(A000001\)\)/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Costo del técnico (RD$) *'), { target: { value: '1200' } });
  fireEvent.change(screen.getByLabelText('Plan de cobro'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
  await waitFor(() => expect(llamadas.find(l => l.url === '/api/aprobaciones/21/aprobar')?.cuerpo)
    .toEqual({ costo_tecnico: '1200', cliente_id: '50', vehiculo_id: '', plan_id: '1' }));
});

test('costos: elige trabajos y marca el pago con su total', async () => {
  const fila = (id: number, costo: number) => ({ instalacion_id: id, tecnico_id: 2, tecnico_nombre: 'Pedro', fecha_instalacion: '2026-10-17T14:00:00Z', tipo: 'Instalación',
    cliente_nombre: 'Flota', vehiculo_descripcion: 'TOYOTA (L1)', costo, pagado_at: null, referencia: null });
  const llamadas = simularApi({
    'GET /api/costos-tecnicos/resumen': () => Response.json([{ tecnico_id: 2, tecnico_nombre: 'Pedro', trabajos: 2, total: 1700, pagado: 0, pendiente: 1700 }]),
    'GET /api/costos-tecnicos?estado=pendientes': () => Response.json([fila(1, 1200), fila(2, 500)]),
    'POST /api/costos-tecnicos/pagar': () => Response.json({ marcados: 2, total: 1700 }),
  });
  vi.spyOn(window, 'prompt').mockReturnValue('Transferencia 0042');
  render(<CostosTecnicos />);
  expect(await screen.findByText('Debe RD$1,700.00')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Elegir trabajo 1'));
  fireEvent.click(screen.getByLabelText('Elegir trabajo 2'));
  fireEvent.click(screen.getByRole('button', { name: /Marcar pagado \(2\) · RD\$1,700.00/ }));
  await waitFor(() => expect(llamadas.find(l => l.url === '/api/costos-tecnicos/pagar')?.cuerpo).toEqual({ instalacion_ids: [1, 2], referencia: 'Transferencia 0042' }));
});
