import { expect, test } from 'vitest';
import { esquemaPago, esquemaPlan, esquemaServicio } from './cobros';
import { fechaEnRD, sumarDias, sumarMeses } from './fechas';

test('periodos: fin de mes, años bisiestos y fecha local de Santo Domingo', () => {
  expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
  expect(sumarMeses('2024-02-29', 12)).toBe('2025-02-28');
  expect(sumarMeses('2025-11-01', 12)).toBe('2026-11-01');
  expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-15');
  expect(sumarDias('2026-11-01', -1)).toBe('2026-10-31');
  // 03:30 UTC del 19 todavía es día 18 en Santo Domingo (UTC-4).
  expect(fechaEnRD(new Date('2026-10-19T03:30:00Z'))).toBe('2026-10-18');
});

test('importes: positivos, dos decimales como máximo y planes gratuitos permitidos', () => {
  expect(esquemaPlan.parse({ nombre: 'Plan Anual', periodicidad: 'Anual', precio: '5500' }).precio).toBe(5500);
  expect(esquemaPlan.safeParse({ nombre: 'Cortesía', periodicidad: 'Anual', precio: 0 }).success).toBe(true);
  expect(esquemaPlan.safeParse({ nombre: 'X', periodicidad: 'Anual', precio: 10.555 }).success).toBe(false);
  const pago = { cliente_id: 1, fecha: '2026-10-18', metodo: 'Efectivo' };
  expect(esquemaPago.safeParse({ ...pago, monto: '0' }).success).toBe(false);
  expect(esquemaPago.safeParse({ ...pago, monto: -5 }).success).toBe(false);
  expect(esquemaPago.parse({ ...pago, monto: '1500.50' }).monto).toBe(1500.5);
  expect(esquemaServicio.parse({ vehiculo_id: '7', plan_id: 1, fecha_inicio: '2026-10-18', precio: '' }).precio).toBeNull();
});

test('periodos de filtro: semana lunes-domingo, mes, mes anterior y año', async () => {
  const { rangoPeriodo } = await import('./fechas');
  expect(rangoPeriodo('semana', '2026-10-18')).toEqual({ desde: '2026-10-12', hasta: '2026-10-18' });
  expect(rangoPeriodo('semana', '2026-10-19')).toEqual({ desde: '2026-10-19', hasta: '2026-10-25' });
  expect(rangoPeriodo('mes', '2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  expect(rangoPeriodo('mes_anterior', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
  expect(rangoPeriodo('anio', '2026-10-18')).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' });
  expect(rangoPeriodo('todo', '2026-10-18')).toEqual({ desde: null, hasta: null });
});
