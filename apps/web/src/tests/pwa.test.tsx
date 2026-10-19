import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import BotonInstalar from '../components/BotonInstalar';

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: avisos, Toaster: () => null }));

test('sin diálogo nativo explica cómo instalarla desde el menú del navegador', () => {
  render(<BotonInstalar />);
  fireEvent.click(screen.getByRole('button', { name: /Descargar app/ }));
  expect(screen.getByText('Instalar aplicación')).toBeInTheDocument();
});

test('en iPhone indica Compartir → Añadir a pantalla de inicio', () => {
  const agente = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1');
  render(<BotonInstalar />);
  fireEvent.click(screen.getByRole('button', { name: /Descargar app/ }));
  expect(screen.getByText('Añadir a pantalla de inicio')).toBeInTheDocument();
  agente.mockRestore();
});

test('con el diálogo nativo del navegador lo abre y, si se acepta, el botón desaparece', async () => {
  render(<BotonInstalar />);
  const prompt = vi.fn(async () => {});
  const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  act(() => { window.dispatchEvent(evento); });
  expect(evento.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Descargar app/ }));
  await waitFor(() => expect(avisos.success).toHaveBeenCalledWith('App instalada: búscala en tu pantalla de inicio'));
  expect(prompt).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /Descargar app/ })).not.toBeInTheDocument();
});
