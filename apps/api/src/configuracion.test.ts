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
  const correo = { RESEND_API_KEY: 're_x', CORREO_REMITENTE: 'Easyway <no-reply@ejemplo.do>' };
  expect(() => validarConfiguracionServidor({ DATABASE_URL, NODE_ENV: 'production', ...correo })).toThrow('SUPABASE_URL');
  const storage = { SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_prueba_0123456789' };
  const completa = validarConfiguracionServidor({ DATABASE_URL, NODE_ENV: 'production', API_PUERTO: '4000', ...correo, ...storage });
  expect(completa).toMatchObject({
    puerto: 4000, produccion: true, resend: { remitente: 'Easyway <no-reply@ejemplo.do>' },
    storage: { url: 'https://proyecto.supabase.co', bucket: 'vehicles' },
  });
});

test('servidor: puerto y host de Render (PORT, API_HOST) sin perder los valores locales', () => {
  const DATABASE_URL = 'postgres://usuario:clave@localhost:5432/prueba';
  expect(validarConfiguracionServidor({ DATABASE_URL })).toMatchObject({ puerto: 3001, host: '127.0.0.1' });
  expect(validarConfiguracionServidor({ DATABASE_URL, PORT: '10000', API_HOST: '0.0.0.0' })).toMatchObject({ puerto: 10000, host: '0.0.0.0' });
  expect(validarConfiguracionServidor({ DATABASE_URL, PORT: '10000', API_PUERTO: '3001' }).puerto).toBe(3001);
  expect(() => validarConfiguracionServidor({ DATABASE_URL, API_HOST: 'ejemplo.com' })).toThrow('API_HOST');
});

test('servidor: Storage opcional en desarrollo, completo y con clave secreta', () => {
  const DATABASE_URL = 'postgres://usuario:clave@localhost:5432/prueba';
  expect(validarConfiguracionServidor({ DATABASE_URL }).storage).toBeNull();
  expect(() => validarConfiguracionServidor({ DATABASE_URL, SUPABASE_URL: 'https://proyecto.supabase.co' })).toThrow('juntas');
  expect(() => validarConfiguracionServidor({ DATABASE_URL, SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SECRET_KEY: 'sb_publishable_0123456789abcdef' }))
    .toThrow('clave secreta');
});
