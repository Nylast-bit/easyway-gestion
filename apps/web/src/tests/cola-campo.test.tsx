import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { UsuarioSesion } from '@easyway/shared';
import TrabajoCampo from '../pantallas/TrabajoCampo';
import MainLayout from '../layouts/MainLayout';
import { ContextoSesion } from '../lib/sesion';
import { listarBorradores, useEnvioAutomatico, vaciarCola, guardarBorrador, type Borrador } from '../lib/colaCampo';
import { respuestaPorDefecto } from './preparacion';

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: avisos, Toaster: () => null }));

const tecnico: UsuarioSesion = { id: 7, nombre: 'Pedro', usuario: 'pedro', correo: null, rol: 'tecnico', tecnico_id: 2 };
const creado = { id: 21, aprobacion: 'Pendiente', tipo: 'Instalación', cliente_nombre: 'Flota · nuevo', vehiculo_descripcion: 'X', imei: '863829070000001', fotos: 0 };

// Red simulada: `senal` decide si fetch llega al servidor; cada ruta POST puede fallar a propósito.
let senal = true;
let fallar: Record<string, number> = {};
let llamadas: { url: string; metodo: string; cuerpo: unknown }[] = [];
function simularRed() {
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => senal);
  vi.stubGlobal('fetch', vi.fn(async (url: string, opciones?: RequestInit) => {
    if (!senal) throw new TypeError('Failed to fetch');
    const metodo = opciones?.method ?? 'GET';
    const clave = `${metodo} ${url}`;
    const cuerpo = typeof opciones?.body === 'string' ? JSON.parse(opciones.body) : opciones?.body;
    llamadas.push({ url, metodo, cuerpo });
    if (fallar[clave]) { fallar[clave]--; throw new TypeError('Failed to fetch'); }
    if (url === '/api/auth/sesion') return Response.json({ usuario: tecnico });
    if (url === '/api/tipos-servicio?activos=1') return Response.json([{ id: 1, nombre: 'Instalación', activo: true }]);
    if (url === '/api/campo/costos') return Response.json({ tecnico_id: 2, tecnico_nombre: 'Pedro', trabajos: 0, total: 0, pagado: 0, pendiente: 0 });
    if (clave === 'POST /api/campo/trabajos') return Response.json(creado, { status: 201 });
    if (clave === 'POST /api/fotos/trabajo/21') return Response.json({ id: 1 }, { status: 201 });
    if (clave === 'POST /api/auth/logout') return new Response(null, { status: 204 });
    return respuestaPorDefecto(url);
  }));
}
const posts = (ruta: string) => llamadas.filter(l => l.metodo === 'POST' && l.url === ruta);

beforeEach(() => {
  senal = true;
  fallar = {};
  llamadas = [];
  avisos.success.mockReset();
  avisos.error.mockReset();
  simularRed();
});
afterEach(async () => { await vaciarCola(); });

// Pantalla del técnico con el envío automático que monta MainLayout.
function Portal() {
  useEnvioAutomatico(tecnico.id);
  return <TrabajoCampo />;
}
const montar = () => render(<ContextoSesion.Provider value={tecnico}><Portal /></ContextoSesion.Provider>);

// La pantalla carga con señal (tipos de servicio) y `sinSenal` la corta justo antes de enviar.
async function llenarYEnviar(fotos = 1, sinSenal = false) {
  fireEvent.click(await screen.findByRole('button', { name: /Nuevo trabajo/ }));
  await waitFor(() => expect(screen.getByLabelText('Tipo de servicio *')).toHaveValue('1'));
  fireEvent.click(screen.getByRole('button', { name: 'Es un cliente nuevo' }));
  fireEvent.change(screen.getByLabelText('Cliente *'), { target: { value: 'Flota del Este SRL' } });
  fireEvent.change(screen.getByLabelText('Vehículo *'), { target: { value: 'l123456' } });
  fireEvent.change(screen.getByLabelText('IMEI *'), { target: { value: '863829070000001' } });
  const archivos = Array.from({ length: fotos }, (_, i) => new File([new Uint8Array([137, 80, 78, 71, i])], `tablero-${i}.png`, { type: 'image/png' }));
  if (fotos) fireEvent.change(screen.getByTestId('adjuntar-trabajo'), { target: { files: archivos } });
  if (sinSenal) senal = false;
  fireEvent.click(screen.getByRole('button', { name: 'Enviar trabajo' }));
}

test('sin señal: el trabajo y su foto se guardan en el teléfono y se envían solos al volver la conexión', async () => {
  montar();
  await llenarYEnviar(1, true);
  expect(await screen.findByText('Sin enviar · se enviará al volver la señal')).toBeInTheDocument();
  expect(screen.getByText('Instalación · Flota del Este SRL · nuevo')).toBeInTheDocument();
  expect(screen.getByText('1 foto(s) en el teléfono')).toBeInTheDocument();
  expect(avisos.success).toHaveBeenCalledWith(expect.stringMatching(/^Sin señal/));
  expect(llamadas.filter(l => l.metodo === 'POST')).toEqual([]);
  llamadas = [];
  const [guardado] = await listarBorradores(tecnico.id);
  expect(guardado.cuerpo).toMatchObject({ imei: '863829070000001', clave_idempotencia: guardado.clave });

  // Vuelve la señal: primero el trabajo con su clave, luego la foto; el borrador desaparece.
  senal = true;
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await waitFor(() => expect(screen.queryByText('Sin enviar · se enviará al volver la señal')).not.toBeInTheDocument());
  expect(posts('/api/campo/trabajos').map(l => l.cuerpo)).toEqual([expect.objectContaining({ clave_idempotencia: guardado.clave })]);
  expect(posts('/api/fotos/trabajo/21')).toHaveLength(1);
  expect(llamadas.filter(l => l.metodo === 'POST').map(l => l.url)).toEqual(['/api/campo/trabajos', '/api/fotos/trabajo/21']);
  expect(avisos.success).toHaveBeenCalledWith('Se envió el trabajo guardado sin señal');
  expect(await listarBorradores(tecnico.id)).toEqual([]);
});

test('la señal se corta a mitad: el reintento reusa la clave y solo sube las fotos que faltaban', async () => {
  // Se pierde la respuesta del trabajo: queda en cola con la misma clave.
  fallar = { 'POST /api/campo/trabajos': 1 };
  montar();
  await llenarYEnviar(2);
  expect(await screen.findByText('Sin enviar · se enviará al volver la señal')).toBeInTheDocument();
  const clave = (posts('/api/campo/trabajos')[0].cuerpo as { clave_idempotencia: string }).clave_idempotencia;

  // Reintentar: el trabajo se crea, la primera foto sube y la segunda se corta.
  let fotos = 0;
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, opciones) => {
    if (url === '/api/fotos/trabajo/21' && ++fotos === 2) throw new TypeError('Failed to fetch');
    return base(url, opciones);
  });
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
  expect(await screen.findByText('Trabajo recibido; faltan fotos · se enviarán al volver la señal')).toBeInTheDocument();
  expect(screen.getByText('1 foto(s) en el teléfono')).toBeInTheDocument();

  vi.mocked(fetch).mockImplementation(base);
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
  await waitFor(() => expect(screen.queryByText(/se enviarán al volver la señal/)).not.toBeInTheDocument());
  // Dos intentos del trabajo con la misma clave (la API devuelve el mismo) y una sola subida por foto lograda.
  expect(posts('/api/campo/trabajos').map(l => (l.cuerpo as { clave_idempotencia: string }).clave_idempotencia)).toEqual([clave, clave]);
  expect(posts('/api/fotos/trabajo/21')).toHaveLength(2);
  expect(await listarBorradores(tecnico.id)).toEqual([]);
});

test('un rechazo de la API se muestra en el borrador; descartar lo borra del teléfono', async () => {
  montar();
  await llenarYEnviar(0, true);
  expect(await screen.findByText('Sin enviar · se enviará al volver la señal')).toBeInTheDocument();
  senal = true;
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, opciones) =>
    url === '/api/campo/trabajos' ? Response.json({ error: 'Tipo de servicio no disponible' }, { status: 400 }) : base(url, opciones));
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
  expect(await screen.findByText('No se pudo enviar: Tipo de servicio no disponible')).toBeInTheDocument();

  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: /Descartar/ }));
  await waitFor(() => expect(screen.queryByText(/No se pudo enviar/)).not.toBeInTheDocument());
  expect(await listarBorradores(tecnico.id)).toEqual([]);
});

const borrador = (usuario_id: number, clave: string): Borrador => ({
  clave, usuario_id, creado: new Date().toISOString(), trabajo_id: null, fotos: [], fotos_fallidas: 0, error: null,
  cuerpo: { imei: '863829070000002', clave_idempotencia: clave }, resumen: { tipo: 'Instalación', cliente: 'Otro', vehiculo: 'Y', imei: '863829070000002', fecha: null },
});

test('solo se ven y envían los borradores de la cuenta; al cerrar sesión se borran todos', async () => {
  senal = false;
  await guardarBorrador(borrador(99, '11111111-1111-4111-8111-111111111111'));
  // Con aviso de rechazo: el envío automático al montar el portal lo salta y sigue en cola al cerrar sesión.
  await guardarBorrador({ ...borrador(tecnico.id, '22222222-2222-4222-8222-222222222222'), error: 'Tipo de servicio no disponible' });
  expect((await listarBorradores(tecnico.id)).map(b => b.clave)).toEqual(['22222222-2222-4222-8222-222222222222']);

  senal = true;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MainLayout><h1>Contenido</h1></MainLayout>);
  // El menú del técnico aparece cuando la sesión ya cargó.
  await screen.findByRole('link', { name: /Trabajo de campo/ });
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await waitFor(() => expect(posts('/api/auth/logout')).toHaveLength(1));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Tienes \d trabajo\(s\) sin enviar/));
  expect(await listarBorradores(tecnico.id)).toEqual([]);
  expect(await listarBorradores(99)).toEqual([]);
});
