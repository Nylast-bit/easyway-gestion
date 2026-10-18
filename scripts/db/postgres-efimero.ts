import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Base efímera independiente de DATABASE_URL: nunca ejecutar pruebas contra el destino real.
export async function iniciarPostgresEfimero() {
  const nombre = `easyway-prueba-${randomUUID()}`;
  const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
  docker('run', '--detach', '--rm', '--name', nombre, '-e', 'POSTGRES_PASSWORD=prueba-local',
    '-p', '127.0.0.1::5432', 'postgres:16-alpine');
  let cliente: ReturnType<typeof postgres> | undefined;
  const detener = async () => {
    try { if (cliente) await cliente.end(); }
    finally { docker('stop', nombre); }
  };
  try {
    const puerto = docker('inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', nombre);
    const url = `postgres://postgres:prueba-local@127.0.0.1:${puerto}/postgres`;
    cliente = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
    for (let intento = 0; intento < 30; intento++) {
      try { await cliente`SELECT 1`; break; }
      catch (error) { if (intento === 29) throw error; await setTimeout(500); }
    }
    const migrar = () => migrate(drizzle(cliente!), { migrationsFolder: 'apps/api/drizzle' });
    await migrar();
    return { url, cliente, migrar, detener };
  } catch (error) {
    await detener();
    throw error;
  }
}
