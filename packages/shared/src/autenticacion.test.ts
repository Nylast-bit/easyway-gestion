import { expect, test } from 'vitest';
import {
  clasificarIdentificador, esquemaCambiarContrasena, esquemaCedula, esquemaCrearUsuario, esquemaLogin, esquemaRecuperarPorCedula,
  esquemaVerificarCorreo, formatearCedula,
} from './autenticacion';

test('clasifica correo y usuario normalizando mayúsculas y espacios', () => {
  expect(clasificarIdentificador('  Ana.Perez@Magna.com.do ')).toEqual({ tipo: 'correo', valor: 'ana.perez@magna.com.do' });
  expect(clasificarIdentificador('Tecnico_01')).toEqual({ tipo: 'usuario', valor: 'tecnico_01' });
  expect(clasificarIdentificador('ana@')).toBeNull();
  expect(clasificarIdentificador('ab')).toBeNull();
  expect(clasificarIdentificador('con espacio')).toBeNull();
});

test('valida login y código OTP de seis dígitos', () => {
  expect(esquemaLogin.safeParse({ identificador: 'admin', contrasena: 'x' }).success).toBe(true);
  expect(esquemaLogin.safeParse({ identificador: '', contrasena: 'x' }).success).toBe(false);
  expect(esquemaVerificarCorreo.safeParse({ desafio: 'a'.repeat(43), codigo: '012345' }).success).toBe(true);
  expect(esquemaVerificarCorreo.safeParse({ desafio: 'a'.repeat(43), codigo: '12345' }).success).toBe(false);
});

test('crear usuario exige identificador, contraseña larga y técnico solo con rol técnico', () => {
  const base = { nombre: 'Ana', contrasena: 'clave-segura-1' };
  expect(esquemaCrearUsuario.parse({ ...base, correo: ' ANA@Magna.com.do' })).toMatchObject({ correo: 'ana@magna.com.do', rol: 'tecnico' });
  expect(esquemaCrearUsuario.safeParse(base).success).toBe(false);
  expect(esquemaCrearUsuario.safeParse({ ...base, usuario: 'ana', contrasena: 'corta' }).success).toBe(false);
  expect(esquemaCrearUsuario.safeParse({ ...base, usuario: 'ana', rol: 'admin', tecnico_id: 1 }).success).toBe(false);
});

test('cédula: acepta guiones y espacios, guarda 11 dígitos y se formatea', () => {
  expect(esquemaCedula.parse('001-1234567-8')).toBe('00112345678');
  expect(esquemaCedula.parse(' 402 1234567 1 ')).toBe('40212345671');
  expect(esquemaCedula.safeParse('001-123456-8').success).toBe(false);
  expect(formatearCedula('00112345678')).toBe('001-1234567-8');
  expect(esquemaRecuperarPorCedula.parse({ usuario: ' Gabo ', cedula: '00112345678' })).toEqual({ usuario: 'gabo', cedula: '00112345678' });
});

test('cambiar contraseña: la nueva cumple el mínimo y es distinta de la actual', () => {
  expect(esquemaCambiarContrasena.safeParse({ actual: 'k7Pm-x3Qa-Z9tR', nueva: 'clave-nueva-456' }).success).toBe(true);
  expect(esquemaCambiarContrasena.safeParse({ actual: 'k7Pm-x3Qa-Z9tR', nueva: 'corta' }).success).toBe(false);
  expect(esquemaCambiarContrasena.safeParse({ actual: 'clave-nueva-456', nueva: 'clave-nueva-456' }).error?.issues[0].message)
    .toBe('La contraseña nueva debe ser distinta de la actual');
});
