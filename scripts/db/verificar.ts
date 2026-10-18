import { conectar, informarError } from './conexion.js';

try {
  const cliente = conectar();
  try {
    await cliente.begin('read only', async (consulta) => {
      const [version] = await consulta`SELECT current_setting('server_version') AS version`;
      const tablas = await consulta`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
      const politicas = await consulta`SELECT count(*)::int AS cantidad FROM pg_policies WHERE schemaname = 'public'`;
      console.log(JSON.stringify({ version: version.version, tablas, politicas }, null, 2));
    });
  } finally { await cliente.end(); }
} catch (error) { informarError(error); }
