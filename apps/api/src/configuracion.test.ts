import { expect, test } from 'vitest';
import { validarConfiguracion } from './configuracion';

test('acepta PostgreSQL y omite variables ajenas al backend', () => {
  const DATABASE_URL = 'postgres://usuario:clave@localhost:5432/prueba';
  expect(validarConfiguracion({ DATABASE_URL, OTRA: 'valor' })).toEqual({ DATABASE_URL });
});
test.each([undefined, '', 'https://example.com'])('rechaza configuración inválida sin revelar credenciales: %s', DATABASE_URL => {
  expect(() => validarConfiguracion({ DATABASE_URL })).toThrow('DATABASE_URL ausente o inválida');
});
