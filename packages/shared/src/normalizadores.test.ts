import { expect, test } from 'vitest';
import { normalizarClaveNombre, normalizarCorreo, normalizarTelefono, normalizarTexto } from './normalizadores';

test.each([null, undefined, '-', '', ' N/A ', '#VALUE!', '#ERROR!'])('normaliza ausencia de datos: %s', valor => {
  expect(normalizarTexto(valor)).toBeNull();
});
test('colapsa espacios sin perder acentos del texto original', () => {
  expect(normalizarTexto('  José\n  Pérez  ')).toBe('José Pérez');
});
test.each(['+1 (809) 180-2704', '1 8091802704', '809-180-2704', 8091802704])('normaliza teléfono %s', valor => {
  expect(normalizarTelefono(valor)).toBe('8091802704');
});
test('no inventa teléfonos incompletos ni transforma ICCID en teléfono', () => {
  expect(normalizarTelefono('123')).toBeNull();
  expect(normalizarTelefono('89314404001234567890')).toBeNull();
});
test('correo válido en minúsculas; inválido conserva advertencia', () => {
  expect(normalizarCorreo('  Persona@Example.COM ')).toEqual({ valor: 'persona@example.com' });
  expect(normalizarCorreo('sin-correo')).toEqual({ valor: null, advertencia: 'Correo inválido' });
  expect(normalizarCorreo('-')).toEqual({ valor: null });
});
test.each(['José Pérez SRL', 'JOSÉ PÉREZ S.R.L.', 'José Pérez E.I.R.L.'])('normaliza sufijos empresariales: %s', valor => {
  expect(normalizarClaveNombre(valor)).toBe('jose perez');
});
