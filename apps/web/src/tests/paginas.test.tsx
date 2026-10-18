import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { expect, test } from 'vitest';
import Clients from '../pantallas/Clients';
import Technicians from '../pantallas/Technicians';
import Vehicles from '../pantallas/Vehicles';
import Gps from '../pantallas/Gps';
import Simcards from '../pantallas/Simcards';
import Installations from '../pantallas/Installations';
import Dashboard from '../pantallas/Dashboard';
import MainLayout from '../layouts/MainLayout';

test.each([
  ['Clientes', Clients], ['Técnicos', Technicians], ['Vehículos', Vehicles],
  ['GPS', Gps], ['Simcards', Simcards], ['Instalaciones', Installations], ['Dashboard', Dashboard],
] as const)('renderiza %s y completa carga sin producción', async (_nombre, Pagina) => {
  const { container } = render(<Pagina />);
  await waitFor(() => expect(container.querySelector('h1')).not.toBeNull());
  expect(screen.queryByText(/Error al cargar/)).not.toBeInTheDocument();
});

test('conserva las siete rutas, marca Dashboard y abre/cierra búsqueda con teclado', async () => {
  render(<MainLayout><h1>Contenido</h1></MainLayout>);
  expect(await screen.findAllByRole('link')).toHaveLength(7);
  expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/clients');
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(screen.getByPlaceholderText('Buscar clientes, vehículos o GPS...')).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByPlaceholderText('Buscar clientes, vehículos o GPS...')).not.toBeInTheDocument();
});
