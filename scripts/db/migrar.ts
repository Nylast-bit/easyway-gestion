import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL. Configúrala en el entorno antes de migrar.');
const cliente = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await migrate(drizzle(cliente), { migrationsFolder: 'apps/api/drizzle' });
  console.log('Migraciones aplicadas correctamente.');
} finally {
  await cliente.end();
}
