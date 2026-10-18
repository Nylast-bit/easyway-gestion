import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Cobros from '../pantallas/Cobros';
import Vencimientos from '../pantallas/Vencimientos';
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

const resumen = { pendiente: 9500, vencido: 5500, clientes_con_deuda: 1, cobrado_mes: 1500, por_generar: 2,
  deudores: [{ cliente_id: 3, cliente_nombre: 'Transporte Caribe', saldo: 9500, vencido: 5500 }] };
const cuenta = {
  cliente: { id: 3, nombre: 'Transporte Caribe' }, total_cargado: 11000, total_pagado: 1500, saldo_pendiente: 9500, saldo_vencido: 5500, saldo_a_favor: 0,
  servicios: [{ id: 1, vehiculo_id: 7, plan_id: 1, plan_nombre: 'Plan Anual', periodicidad: 'Anual', precio: 5500, fecha_inicio: '2025-11-01',
    proximo_cobro: '2027-11-01', estado: 'Activo', notas: null, vehiculo: { marca: 'ISUZU', modelo: 'NQR', placa: 'L123', cliente_id: 3, cliente_nombre: 'Transporte Caribe' } }],
  cargos: [
    { id: 10, cliente_id: 3, cliente_nombre: 'Transporte Caribe', servicio_id: 1, concepto: 'Plan Anual · L123', periodo_inicio: '2025-11-01', periodo_fin: '2026-10-31',
      monto: 5500, pagado: 0, saldo: 5500, fecha_vencimiento: '2025-11-01', vencido: true, estado: 'Pendiente', referencia_factura: null, motivo_anulacion: null, created_at: '' },
    { id: 11, cliente_id: 3, cliente_nombre: 'Transporte Caribe', servicio_id: 1, concepto: 'Plan Anual · L123', periodo_inicio: '2026-11-01', periodo_fin: '2027-10-31',
      monto: 5500, pagado: 1500, saldo: 4000, fecha_vencimiento: '2026-11-01', vencido: false, estado: 'Parcial', referencia_factura: 'FACT/2026/00300', motivo_anulacion: null, created_at: '' },
  ],
  pagos: [{ id: 5, cliente_id: 3, cliente_nombre: 'Transporte Caribe', fecha: '2026-10-05', monto: 1500, metodo: 'Tarjeta', referencia: null, notas: null,
    aplicado: 1500, sin_aplicar: 0, anulado: false, motivo_anulacion: null, aplicaciones: [], created_at: '' }],
};

test('cobros: resumen en RD$, estado de cuenta desde un deudor y registro de pago', async () => {
  const llamadas = simularApi({
    'GET /api/cobros/resumen': () => Response.json(resumen),
    'GET /api/cobros/estado-cuenta/3': () => Response.json(cuenta),
    'POST /api/pagos': () => Response.json({}, { status: 201 }),
  });
  render(<Cobros />);
  expect(await screen.findByText('RD$9,500.00')).toBeInTheDocument();
  expect(screen.getByText('Vencido RD$5,500.00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Transporte Caribe/ }));
  expect(await screen.findByText('Estado de cuenta · Transporte Caribe')).toBeInTheDocument();
  expect(screen.getByText('Vencido', { selector: '.status-tag' })).toBeInTheDocument();
  expect(screen.getByText(/FACT\/2026\/00300/)).toBeInTheDocument();
  expect(screen.getByText('saldo RD$4,000.00')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Registrar pago/ }));
  fireEvent.change(screen.getByLabelText('Monto (RD$) *'), { target: { value: '4,000.50' } });
  fireEvent.change(screen.getByLabelText('Referencia / factura'), { target: { value: 'TRF-889' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar pago' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'POST' && l.url === '/api/pagos')?.cuerpo)
    .toMatchObject({ cliente_id: 3, monto: '4000.50', metodo: 'Transferencia', referencia: 'TRF-889' }));
});

test('cobros: anular un cargo pide el motivo y genera cargos hasta hoy', async () => {
  const llamadas = simularApi({
    'GET /api/cobros/resumen': () => Response.json(resumen),
    'GET /api/cobros/estado-cuenta/3': () => Response.json(cuenta),
    'POST /api/cargos/10/anular': () => Response.json({}),
    'POST /api/cargos/generar': () => Response.json({ servicios: 2, creados: 2 }),
  });
  vi.spyOn(window, 'prompt').mockReturnValue('Cortesía');
  render(<Cobros />);
  fireEvent.click(await screen.findByRole('button', { name: /Generar cargos/ }));
  await waitFor(() => expect(avisos.success).toHaveBeenCalledWith('2 cargo(s) generado(s)'));
  expect((llamadas.find(l => l.url === '/api/cargos/generar')!.cuerpo as { hasta: string }).hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  fireEvent.click(screen.getByRole('button', { name: /Transporte Caribe/ }));
  fireEvent.click((await screen.findAllByRole('button', { name: 'Anular cargo' }))[0]);
  await waitFor(() => expect(llamadas.find(l => l.url === '/api/cargos/10/anular')?.cuerpo).toEqual({ motivo: 'Cortesía' }));
});

test('vencimientos: plazo seleccionable, vencidos en rojo y edición de fecha', async () => {
  const llamadas = simularApi({
    'GET /api/vencimientos?dias=30': () => Response.json([
      { tipo: 'gps', id: 11, identificador: '863829070755440', fecha: '2026-10-10', dias_restantes: -8, vehiculo: { id: 7, descripcion: 'ISUZU NQR (L123)', cliente_nombre: 'Transporte Caribe' } },
      { tipo: 'simcard', id: 5, identificador: '8091802704', fecha: '2026-10-25', dias_restantes: 7, vehiculo: null },
    ]),
    'GET /api/vencimientos?dias=90': () => Response.json([]),
    'PUT /api/vencimientos/gps/11': () => new Response(null, { status: 204 }),
  });
  vi.spyOn(window, 'prompt').mockReturnValue('2027-10-10');
  render(<Vencimientos />);
  expect(await screen.findByText('Venció hace 8 d')).toHaveClass('status-red');
  expect(screen.getByText('Transporte Caribe · ISUZU NQR (L123)')).toBeInTheDocument();
  expect(screen.getByText('25/10/2026 · 7 d')).toHaveClass('status-yellow');
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar vencimiento de 863829070755440' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'PUT')?.cuerpo).toEqual({ fecha_vencimiento: '2027-10-10' }));
  fireEvent.click(screen.getByRole('button', { name: '90 días' }));
  expect(await screen.findByText('Nada vence en los próximos 90 días.')).toBeInTheDocument();
});
