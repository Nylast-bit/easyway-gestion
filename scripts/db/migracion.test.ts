import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';

// Base efímera independiente de DATABASE_URL: nunca ejecutar pruebas contra el destino real.
const nombre = `easyway-prueba-${randomUUID()}`;
let cliente: ReturnType<typeof postgres>;
let creado = false;
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
const migrar = () => migrate(drizzle(cliente), { migrationsFolder: 'apps/api/drizzle' });

beforeAll(async () => {
  docker('run', '--detach', '--rm', '--name', nombre, '-e', 'POSTGRES_PASSWORD=prueba-local',
    '-p', '127.0.0.1::5432', 'postgres:16-alpine');
  creado = true;
  const puerto = docker('inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', nombre);
  cliente = postgres(`postgres://postgres:prueba-local@127.0.0.1:${puerto}/postgres`, { max: 1, connect_timeout: 2 });
  for (let intento = 0; intento < 30; intento++) {
    try { await cliente`SELECT 1`; break; }
    catch (error) { if (intento === 29) throw error; await setTimeout(500); }
  }
  await migrar();
}, 180000);

afterAll(async () => {
  try { if (cliente) await cliente.end(); }
  finally { if (creado) docker('stop', nombre); }
});

test('crea las nueve tablas y repetir la migración no duplica su registro', async () => {
  await migrar();
  const tablas = await cliente`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`;
  expect(tablas.map(t => t.tablename).sort()).toEqual([
    'clientes', 'gps', 'gps_asignaciones', 'instalaciones', 'simcard_asignaciones',
    'simcards', 'tecnicos', 'vehiculo_imagenes', 'vehiculos',
  ]);
  expect(tablas.every(t => t.rowsecurity)).toBe(true);
  const [registro] = await cliente`SELECT count(*)::int AS cantidad FROM drizzle.__drizzle_migrations`;
  expect(registro.cantidad).toBe(1);
});

test('protege relaciones, identificadores y una sola asignación activa por equipo', async () => {
  const [persona] = await cliente`INSERT INTO clientes (nombre) VALUES ('Cliente de prueba') RETURNING id`;
  const [vehiculo] = await cliente`INSERT INTO vehiculos (cliente_id) VALUES (${persona.id}) RETURNING id`;
  const [equipo] = await cliente`INSERT INTO gps (imei) VALUES ('863829070755440') RETURNING id`;
  const [sim] = await cliente`INSERT INTO simcards (numero) VALUES ('8091802704') RETURNING id`;
  await expect(cliente`INSERT INTO gps (imei) VALUES ('123')`).rejects.toMatchObject({ code: '23514' });
  await expect(cliente`INSERT INTO gps (imei) VALUES ('863829070755440')`).rejects.toMatchObject({ code: '23505' });
  await expect(cliente`INSERT INTO simcards (numero) VALUES ('8091802704')`).rejects.toMatchObject({ code: '23505' });
  await expect(cliente`INSERT INTO vehiculos (cliente_id) VALUES (-1)`).rejects.toMatchObject({ code: '23503' });
  await cliente`INSERT INTO gps_asignaciones (gps_id, vehiculo_id) VALUES (${equipo.id}, ${vehiculo.id})`;
  await expect(cliente`INSERT INTO gps_asignaciones (gps_id, vehiculo_id) VALUES (${equipo.id}, ${vehiculo.id})`).rejects.toMatchObject({ code: '23505' });
  await cliente`INSERT INTO simcard_asignaciones (simcard_id, gps_id) VALUES (${sim.id}, ${equipo.id})`;
  await expect(cliente`INSERT INTO simcard_asignaciones (simcard_id, gps_id) VALUES (${sim.id}, ${equipo.id})`).rejects.toMatchObject({ code: '23505' });
  await cliente`UPDATE gps_asignaciones SET fecha_fin = now() WHERE gps_id = ${equipo.id}`;
  await cliente`INSERT INTO gps_asignaciones (gps_id, vehiculo_id) VALUES (${equipo.id}, ${vehiculo.id})`;
  await expect(cliente`DELETE FROM clientes WHERE id = ${persona.id}`).rejects.toMatchObject({ code: '23503' });
  await cliente`INSERT INTO instalaciones (vehiculo_id, gps_id) VALUES (${vehiculo.id}, ${equipo.id})`;
});

test('RLS deniega filas a un rol sin políticas incluso si recibe permisos SQL', async () => {
  await cliente`CREATE ROLE visitante_prueba NOLOGIN`;
  await cliente`GRANT USAGE ON SCHEMA public TO visitante_prueba`;
  await cliente`GRANT SELECT, INSERT ON clientes TO visitante_prueba`;
  await cliente`SET ROLE visitante_prueba`;
  try {
    expect(await cliente`SELECT * FROM clientes`).toHaveLength(0);
    await expect(cliente`INSERT INTO clientes (nombre) VALUES ('No autorizado')`).rejects.toMatchObject({ code: '42501' });
  } finally { await cliente`RESET ROLE`; }
});
