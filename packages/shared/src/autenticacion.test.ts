import { expect, test } from 'vitest';
import { clasificarIdentificador, esquemaCrearUsuario, esquemaLogin, esquemaVerificarCorreo } from './autenticacion';

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
