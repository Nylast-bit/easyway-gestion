import { expect, test } from 'vitest';
import { validarConfiguracion, validarConfiguracionServidor } from './configuracion';

test('acepta PostgreSQL y omite variables ajenas al backend', () => {
  const DATABASE_URL = 'postgres://usuario:clave@localhost:5432/prueba';
  expect(validarConfiguracion({ DATABASE_URL, OTRA: 'valor' })).toEqual({ DATABASE_URL });
});
test.each([undefined, '', 'https://example.com'])('rechaza configuración inválida sin revelar credenciales: %s', DATABASE_URL => {
  expect(() => validarConfiguracion({ DATABASE_URL })).toThrow('DATABASE_URL ausente o inválida');
});

test('servidor: sin Resend en desarrollo usa correo simulado; en producción lo exige', () => {
  const DATABASE_URL = 'postgres://usuario:clave@localhost:5432/prueba';
  expect(validarConfiguracionServidor({ DATABASE_URL })).toMatchObject({ puerto: 3001, produccion: false, resend: null });
  expect(() => validarConfiguracionServidor({ DATABASE_URL, NODE_ENV: 'production' })).toThrow('RESEND_API_KEY');
  expect(() => validarConfiguracionServidor({ DATABASE_URL, RESEND_API_KEY: 're_x' })).toThrow('juntas');
  const resend = validarConfiguracionServidor({ DATABASE_URL, NODE_ENV: 'production', RESEND_API_KEY: 're_x', CORREO_REMITENTE: 'Easyway <no-reply@ejemplo.do>', API_PUERTO: '4000' });
  expect(resend).toMatchObject({ puerto: 4000, produccion: true, resend: { remitente: 'Easyway <no-reply@ejemplo.do>' } });
});
