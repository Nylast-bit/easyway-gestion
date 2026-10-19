import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Users from '../pantallas/Users';
import { ContextoSesion } from '../lib/sesion';
import { respuestaPorDefecto } from './preparacion';

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: avisos, Toaster: () => null }));

const yo = { id: 1, nombre: 'Ana Admin', usuario: 'admin', correo: null, rol: 'admin' as const, tecnico_id: null };
const cuentas = [
  { ...yo, activo: true, correo_verificado: false, bloqueado_hasta: null, tecnico_nombre: null, created_at: '2026-10-18T12:00:00Z' },
  { id: 2, nombre: 'Pedro Martínez', usuario: 'pedro', correo: 'pedro@ejemplo.do', rol: 'tecnico', tecnico_id: 4, activo: true,
    correo_verificado: true, bloqueado_hasta: '2999-01-01T00:00:00Z', tecnico_nombre: 'Pedro M.', created_at: '2026-10-18T12:00:00Z' },
];
const fichas = [
  { id: 4, nombre: 'Pedro M.', telefono: null, correo: null, created_at: '' },
  { id: 5, nombre: 'Luis R.', telefono: null, correo: null, created_at: '' },
];

function simularApi(rutas: Record<string, () => Response>) {
  const llamadas: { url: string; metodo: string; cuerpo: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET';
    llamadas.push({ url, metodo, cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : undefined });
    return rutas[`${metodo} ${url}`]?.() ?? respuestaPorDefecto(url);
  }));
  return llamadas;
}

const renderizar = () => render(<ContextoSesion.Provider value={yo}><Users /></ContextoSesion.Provider>);

test('lista cuentas con rol, estado, verificación y bloqueo', async () => {
  simularApi({ 'GET /api/usuarios': () => Response.json(cuentas), 'GET /api/tecnicos': () => Response.json(fichas) });
  renderizar();
  expect(await screen.findByText('Ana Admin (tú)')).toBeInTheDocument();
  expect(screen.getByText('@pedro · pedro@ejemplo.do')).toBeInTheDocument();
  expect(screen.getByText('Correo verificado')).toBeInTheDocument();
  expect(screen.getByText('Ficha: Pedro M.')).toBeInTheDocument();
  expect(screen.getByText('Bloqueada por intentos')).toBeInTheDocument();
});

test('crear técnico: envía identificadores y contraseña; la ficha ya vinculada no se puede elegir', async () => {
  const llamadas = simularApi({
    'GET /api/usuarios': () => Response.json(cuentas), 'GET /api/tecnicos': () => Response.json(fichas),
    'POST /api/usuarios': () => Response.json({ usuario: {} }, { status: 201 }),
  });
  renderizar();
  await screen.findByText('Ana Admin (tú)');
  fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
  fireEvent.change(screen.getByLabelText('Nombre completo *'), { target: { value: 'Luis Rosario' } });
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'Luis.R' } });
  fireEvent.change(screen.getByLabelText('Contraseña inicial *'), { target: { value: 'clave-inicial-1' } });
  const ficha = screen.getByLabelText('Ficha de técnico');
  expect(within(ficha).getByRole('option', { name: 'Pedro M. (ya tiene cuenta)' })).toBeDisabled();
  fireEvent.change(ficha, { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'POST')?.cuerpo).toEqual({
    nombre: 'Luis Rosario', rol: 'tecnico', tecnico_id: '5', usuario: 'luis.r', correo: '', contrasena: 'clave-inicial-1', cedula: '',
  }));
});

test('editar: la cuenta propia no puede desactivarse; restablecer contraseña usa su propia ruta', async () => {
  const llamadas = simularApi({
    'GET /api/usuarios': () => Response.json(cuentas), 'GET /api/tecnicos': () => Response.json(fichas),
    'PUT /api/usuarios/2': () => Response.json(cuentas[1]),
    'PUT /api/usuarios/2/contrasena': () => new Response(null, { status: 204 }),
  });
  renderizar();
  await screen.findByText('Ana Admin (tú)');
  fireEvent.click(screen.getByRole('button', { name: 'Editar Ana Admin' }));
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByLabelText('Rol')).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Editar Pedro Martínez' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(llamadas.find(l => l.url === '/api/usuarios/2')?.cuerpo).toEqual({ nombre: 'Pedro Martínez', rol: 'tecnico', tecnico_id: 4, activo: false, cedula: '' }));

  fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña de Pedro Martínez' }));
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'nueva-clave-456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));
  await waitFor(() => expect(llamadas.find(l => l.url === '/api/usuarios/2/contrasena')?.cuerpo).toEqual({ contrasena: 'nueva-clave-456' }));
});

test('técnicos sin cuenta: el atajo abre el alta con rol técnico, nombre y ficha ya puestos', async () => {
  const llamadas = simularApi({
    'GET /api/usuarios': () => Response.json(cuentas), 'GET /api/tecnicos': () => Response.json(fichas),
    'POST /api/usuarios': () => Response.json({ usuario: {} }, { status: 201 }),
  });
  renderizar();
  expect(await screen.findByText('Técnicos sin cuenta (1).')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Crear cuenta para Pedro M\./ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Crear cuenta para Luis R\./ }));
  expect(screen.getByLabelText('Nombre completo *')).toHaveValue('Luis R.');
  expect(screen.getByLabelText('Ficha de técnico')).toHaveValue('5');
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'luis' } });
  fireEvent.change(screen.getByLabelText('Contraseña inicial *'), { target: { value: 'clave-inicial-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  await waitFor(() => expect(llamadas.find(l => l.metodo === 'POST')?.cuerpo).toMatchObject({ nombre: 'Luis R.', rol: 'tecnico', tecnico_id: 5, usuario: 'luis' }));
});
