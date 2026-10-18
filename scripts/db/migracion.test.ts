import { readFileSync } from 'node:fs';
import type postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { iniciarPostgresEfimero } from './postgres-efimero.js';

let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;
let cliente: ReturnType<typeof postgres>;
const migrar = () => base!.migrar();

beforeAll(async () => {
  base = await iniciarPostgresEfimero();
  cliente = base.cliente;
}, 180000);

afterAll(async () => { await base?.detener(); });

test('crea las tablas y repetir la migración no duplica su registro', async () => {
  await migrar();
  const tablas = await cliente`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`;
  expect(tablas.map(t => t.tablename).sort()).toEqual([
    'auditoria', 'cargos', 'clientes', 'gps', 'gps_asignaciones', 'instalaciones', 'pago_aplicaciones', 'pagos', 'planes', 'servicios', 'sesiones', 'simcard_asignaciones',
    'simcards', 'tecnicos', 'tipos_servicio', 'usuarios', 'vehiculo_imagenes', 'vehiculos', 'verificaciones_correo',
  ]);
  expect(tablas.every(t => t.rowsecurity)).toBe(true);
  const [registro] = await cliente`SELECT count(*)::int AS cantidad FROM drizzle.__drizzle_migrations`;
  const historial = JSON.parse(readFileSync('apps/api/drizzle/meta/_journal.json', 'utf8')) as { entries: unknown[] };
  expect(registro.cantidad).toBe(historial.entries.length);
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
  await cliente`INSERT INTO instalaciones (vehiculo_id, gps_id, tipo_servicio_id) VALUES (${vehiculo.id}, ${equipo.id}, (SELECT id FROM tipos_servicio LIMIT 1))`;
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
