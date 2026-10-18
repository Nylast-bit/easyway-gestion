import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esArchivoProhibido } from './archivos-prohibidos.mjs';

test('bloquea secretos y datos privados incluso en workspaces o rutas Windows', () => {
  for (const ruta of ['.env', '.env.local', 'apps/api/.env.production', 'apps\\web\\.env',
    'backups/schema.sql', 'backups/datos.dump', 'Control de instalación Easyway GPS.xlsx', '.env.example.local']) {
    assert.equal(esArchivoProhibido(ruta), true, ruta);
  }
});
test('permite plantillas sin secretos y solamente el fixture anonimizado acordado', () => {
  for (const ruta of ['.env.example', 'apps/api/.env.example', 'tests/fixtures/excel-muestra.xlsx', 'README.md']) {
    assert.equal(esArchivoProhibido(ruta), false, ruta);
  }
});
