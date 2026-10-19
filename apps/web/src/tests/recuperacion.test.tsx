import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Login from '../pantallas/Login';
import MainLayout from '../layouts/MainLayout';
import { enrutador } from './enrutador';

const usuario = { id: 3, nombre: 'Gabo Chamo', usuario: 'gabo', correo: null, rol: 'tecnico', tecnico_id: 2 };

function simularApi(respuestas: Record<string, () => Response>) {
  const fetch = vi.fn(async (url: string, _opciones?: RequestInit) => respuestas[url]?.() ?? Response.json([]));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const cuerpoDe = (fetch: ReturnType<typeof simularApi>, url: string) =>
  JSON.parse(String(fetch.mock.calls.find(([u]) => u === url)?.[1]?.body));
const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

test('recuperar por correo: pide el código, fija la contraseña nueva y entra', async () => {
  const fetch = simularApi({
    '/api/auth/recuperar': () => Response.json({ desafio: 'd'.repeat(43), correo: 'la•••@ejemplo.do', reintentarEn: 60 }, { status: 202 }),
    '/api/auth/recuperar/confirmar': () => Response.json({ estado: 'sesion_iniciada', usuario: { ...usuario, correo: 'laura@ejemplo.do' } }),
  });
  render(<Login />);
  fireEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }));
  expect(screen.getByRole('heading', { name: 'Recuperar acceso' })).toBeInTheDocument();
  escribir('Correo de tu cuenta', 'Laura@Ejemplo.do');
  fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
  expect(await screen.findByText('la•••@ejemplo.do')).toBeInTheDocument();
  expect(cuerpoDe(fetch, '/api/auth/recuperar')).toEqual({ correo: 'laura@ejemplo.do' });
  expect(screen.getByRole('button', { name: /Reenviar código en 60 s/ })).toBeDisabled();

  escribir('Código de 6 dígitos', '04 82-13');
  escribir('Contraseña nueva', 'clave-nueva-456');
  escribir('Repite la contraseña nueva', 'otra-distinta-1');
  fireEvent.click(screen.getByRole('button', { name: 'Restablecer y entrar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('no coinciden');

  escribir('Repite la contraseña nueva', 'clave-nueva-456');
  fireEvent.click(screen.getByRole('button', { name: 'Restablecer y entrar' }));
  await waitFor(() => expect(enrutador.replace).toHaveBeenCalledWith('/'));
  expect(cuerpoDe(fetch, '/api/auth/recuperar/confirmar')).toEqual({ desafio: 'd'.repeat(43), codigo: '048213', contrasena: 'clave-nueva-456' });
});

test('recuperar por cédula: muestra la contraseña temporal y la deja lista en el login', async () => {
  const fetch = simularApi({ '/api/auth/recuperar/cedula': () => Response.json({ contrasena_temporal: 'k7Pm-x3Qa-Z9tR' }) });
  render(<Login />);
  fireEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }));
  fireEvent.click(screen.getByRole('button', { name: /Sin correo/ }));
  escribir('Usuario', 'Gabo');
  escribir('Cédula', '001-1234567');
  fireEvent.click(screen.getByRole('button', { name: 'Validar cédula' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('11 dígitos');
  expect(fetch).not.toHaveBeenCalled();

  escribir('Cédula', '001-1234567-8');
  fireEvent.click(screen.getByRole('button', { name: 'Validar cédula' }));
  expect(await screen.findByLabelText('Contraseña temporal')).toHaveTextContent('k7Pm-x3Qa-Z9tR');
  expect(cuerpoDe(fetch, '/api/auth/recuperar/cedula')).toEqual({ usuario: 'gabo', cedula: '00112345678' });

  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con ella' }));
  expect(screen.getByLabelText('Usuario o correo')).toHaveValue('gabo');
  expect(screen.getByLabelText('Contraseña')).toHaveValue('k7Pm-x3Qa-Z9tR');
});

test('contraseña pendiente de cambio: el portal no se muestra hasta cambiarla', async () => {
  const fetch = simularApi({
    '/api/auth/sesion': () => Response.json({ usuario: { ...usuario, rol: 'admin', tecnico_id: null, debe_cambiar_contrasena: true } }),
    '/api/auth/cambiar-contrasena': () => Response.json({ usuario: { ...usuario, rol: 'admin', tecnico_id: null, debe_cambiar_contrasena: false } }),
  });
  render(<MainLayout><p>Contenido del portal</p></MainLayout>);
  expect(await screen.findByRole('heading', { name: 'Crea tu contraseña' })).toBeInTheDocument();
  expect(screen.queryByText('Contenido del portal')).not.toBeInTheDocument();

  escribir('Contraseña actual', 'k7Pm-x3Qa-Z9tR');
  escribir('Contraseña nueva', 'clave-nueva-456');
  escribir('Repite la contraseña nueva', 'clave-nueva-456');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
  expect(await screen.findByText('Contenido del portal')).toBeInTheDocument();
  expect(cuerpoDe(fetch, '/api/auth/cambiar-contrasena')).toEqual({ actual: 'k7Pm-x3Qa-Z9tR', nueva: 'clave-nueva-456' });
});
