import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Login from '../pantallas/Login';
import MainLayout from '../layouts/MainLayout';
import { enrutador } from './enrutador';

const usuario = { id: 2, nombre: 'Laura Gómez', usuario: null, correo: 'laura@ejemplo.do', rol: 'admin', tecnico_id: null };

function simularApi(respuestas: Record<string, () => Response>) {
  const fetch = vi.fn(async (url: string, _opciones?: RequestInit) => respuestas[url]?.() ?? Response.json({ error: 'no simulado' }, { status: 500 }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const escribir = (etiqueta: string | RegExp, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

test('usuario sin correo entra directamente y vuelve al inicio', async () => {
  const fetch = simularApi({ '/api/auth/login': () => Response.json({ estado: 'sesion_iniciada', usuario: { ...usuario, correo: null, usuario: 'laura' } }) });
  render(<Login />);
  escribir('Usuario o correo', 'laura');
  escribir('Contraseña', 'clave-segura-1');
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(enrutador.replace).toHaveBeenCalledWith('/'));
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ identificador: 'laura', contrasena: 'clave-segura-1' });
});

test('cuenta con correo: muestra paso OTP, acepta pegar el código y verifica', async () => {
  const fetch = simularApi({
    '/api/auth/login': () => Response.json({ estado: 'verificacion_requerida', desafio: 'd'.repeat(43), correo: 'la•••@ejemplo.do', reintentarEn: 60 }, { status: 202 }),
    '/api/auth/verificar-correo': () => Response.json({ estado: 'sesion_iniciada', usuario }),
  });
  render(<Login />);
  escribir('Usuario o correo', 'laura@ejemplo.do');
  escribir('Contraseña', 'clave-segura-1');
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('heading', { name: 'Verifica tu correo' })).toBeInTheDocument();
  expect(screen.getByText('la•••@ejemplo.do')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reenviar código en 60 s/ })).toBeDisabled();

  fireEvent.paste(screen.getByLabelText('Dígito 1'), { clipboardData: { getData: () => '04 8213' } });
  await waitFor(() => expect(enrutador.replace).toHaveBeenCalledWith('/'));
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ desafio: 'd'.repeat(43), codigo: '048213' });
});

test('muestra el error de la API y valida antes de enviar', async () => {
  const fetch = simularApi({ '/api/auth/login': () => Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 }) });
  render(<Login />);
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Introduce tu usuario o correo');
  expect(fetch).not.toHaveBeenCalled();
  escribir('Usuario o correo', 'laura');
  escribir('Contraseña', 'x');
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos');
});

test('el portal muestra el usuario, cierra sesión y redirige si la sesión caducó', async () => {
  const fetch = simularApi({ '/api/auth/sesion': () => Response.json({ usuario }), '/api/auth/logout': () => new Response(null, { status: 204 }) });
  const { unmount } = render(<MainLayout><h1>Contenido</h1></MainLayout>);
  expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();
  expect(screen.getByText('Administrador')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await waitFor(() => expect(enrutador.replace).toHaveBeenCalledWith('/login'));
  expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  unmount();

  simularApi({ '/api/auth/sesion': () => Response.json({ error: 'Sesión no iniciada o caducada' }, { status: 401 }) });
  render(<MainLayout><h1>Contenido</h1></MainLayout>);
  await waitFor(() => expect(enrutador.replace).toHaveBeenCalledWith('/login?siguiente=%2F'));
});
