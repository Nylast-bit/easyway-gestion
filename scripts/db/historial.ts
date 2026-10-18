import { readFileSync } from 'node:fs';
import { conectar, informarError } from './conexion.js';

// Solo lectura: compara las migraciones registradas en el destino con las versionadas en el repositorio.
try {
  const cliente = conectar();
  try {
    await cliente.begin('read only', async (consulta) => {
      const registradas = await consulta`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
      const historial = JSON.parse(readFileSync('apps/api/drizzle/meta/_journal.json', 'utf8')) as { entries: { tag: string; when: number }[] };
      const aplicadas = new Set(registradas.map(r => Number(r.created_at)));
      console.log(JSON.stringify(historial.entries.map(e => ({ migracion: e.tag, aplicada: aplicadas.has(e.when) })), null, 2));
      if (registradas.length > historial.entries.length) console.log('Aviso: el destino tiene migraciones que no están en el repositorio.');
    });
  } finally { await cliente.end(); }
} catch (error) { informarError(error); }
