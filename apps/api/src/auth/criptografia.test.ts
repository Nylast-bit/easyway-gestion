import { expect, test } from 'vitest';
import { generarCodigoOtp, hashearContrasena, igualesSeguro, verificarContrasena } from './criptografia';

test('hash scrypt con sal: verifica la correcta y rechaza otras o formatos ajenos', async () => {
  const hash = await hashearContrasena('clave-segura-1');
  expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
  expect(hash).not.toContain('clave-segura-1');
  expect(await hashearContrasena('clave-segura-1')).not.toBe(hash);
  expect(await verificarContrasena('clave-segura-1', hash)).toBe(true);
  expect(await verificarContrasena('clave-segura-2', hash)).toBe(false);
  expect(await verificarContrasena('clave-segura-1', 'bcrypt$algo')).toBe(false);
});

test('códigos OTP de longitud fija con ceros a la izquierda y comparación segura', () => {
  for (let i = 0; i < 200; i++) expect(generarCodigoOtp(6)).toMatch(/^\d{6}$/);
  expect(igualesSeguro('abc', 'abc')).toBe(true);
  expect(igualesSeguro('abc', 'abd')).toBe(false);
  expect(igualesSeguro('abc', 'abcd')).toBe(false);
});
