import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { conectar, informarError } from './conexion.js';

try {
  const cliente = conectar();
  try {
    await migrate(drizzle(cliente), { migrationsFolder: 'apps/api/drizzle' });
    console.log('Migraciones aplicadas correctamente.');
  } finally {
    await cliente.end();
  }
} catch (error) { informarError(error); }
