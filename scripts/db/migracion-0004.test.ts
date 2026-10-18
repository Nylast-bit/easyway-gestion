import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { iniciarPostgresEfimero } from './postgres-efimero.js';

// La 0004 pasa instalaciones.tipo (texto) a un catálogo: comprobar que no se pierde ningún dato.
let base: Awaited<ReturnType<typeof iniciarPostgresEfimero>> | undefined;

function migracionesHasta(etiqueta: string) {
  const destino = mkdtempSync(join(tmpdir(), 'easyway-migraciones-'));
  cpSync('apps/api/drizzle', destino, { recursive: true });
  const ruta = join(destino, 'meta', '_journal.json');
  const historial = JSON.parse(readFileSync(ruta, 'utf8')) as { entries: { tag: string }[] };
  historial.entries = historial.entries.slice(0, historial.entries.findIndex(e => e.tag === etiqueta) + 1);
  writeFileSync(ruta, JSON.stringify(historial));
  return destino;
}

beforeAll(async () => {
  base = await iniciarPostgresEfimero({ migraciones: migracionesHasta('0003_autor_imagenes') });
}, 180000);

afterAll(async () => { await base?.detener(); });

test('0004/0005 conservan el tipo de instalaciones existentes y siembran catálogo y plan anual', async () => {
  const sql = base!.cliente;
  const [cliente] = await sql`INSERT INTO clientes (nombre) VALUES ('C') RETURNING id`;
  const [vehiculo] = await sql`INSERT INTO vehiculos (cliente_id) VALUES (${cliente.id}) RETURNING id`;
  const [equipo] = await sql`INSERT INTO gps (imei) VALUES ('863829070000001') RETURNING id`;
  for (const tipo of ['Mantenimiento', 'Cambio de Equipo', 'Retiro', 'retiro ', 'Instalación']) {
    await sql`INSERT INTO instalaciones (vehiculo_id, gps_id, tipo) VALUES (${vehiculo.id}, ${equipo.id}, ${tipo})`;
  }
  await base!.migrar();

  const filas = await sql`SELECT t.nombre FROM instalaciones i JOIN tipos_servicio t ON t.id = i.tipo_servicio_id ORDER BY i.id`;
  expect(filas.map(f => f.nombre)).toEqual(['Mantenimiento', 'Cambio de equipo', 'Retiro', 'Retiro', 'Instalación']);
  const catalogo = await sql`SELECT nombre FROM tipos_servicio ORDER BY id`;
  expect(catalogo.map(f => f.nombre)).toEqual(['Instalación', 'Venta', 'Mantenimiento', 'Cambio de equipo', 'Cambio de SIM',
    'Reinstalación', 'Reparación', 'Entrega', 'Desinstalación', 'Retiro']);
  expect(await sql`SELECT nombre, periodicidad, precio::text FROM planes`).toEqual([{ nombre: 'Plan Anual', periodicidad: 'Anual', precio: '5500.00' }]);
  const [{ aprobadas }] = await sql`SELECT count(*)::int AS aprobadas FROM instalaciones WHERE aprobacion = 'Aprobada'`;
  expect(aprobadas).toBe(5);
  const columnas = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'instalaciones' AND column_name = 'tipo'`;
  expect(columnas).toHaveLength(0);
});
