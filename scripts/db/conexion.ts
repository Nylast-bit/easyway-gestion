import { loadEnvFile } from 'node:process';
import postgres from 'postgres';

try { loadEnvFile('.env'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo cargar .env'); }

export function conectar() {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) throw new Error('Falta DATABASE_URL en el entorno o .env');
  let url: URL;
  try { url = new URL(cadena); } catch { throw new Error('DATABASE_URL no es una URL válida'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL debe ser una conexión PostgreSQL');
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') {
    throw new Error('Usa conexión directa o pooler de sesión, no pooler de transacciones para migrar');
  }
  return postgres(cadena, { max: 1, connect_timeout: 10 });
}

export function informarError(error: unknown) {
  const codigo = (error as { code?: string }).code;
  console.error('La operación de BD falló. Código:', codigo || 'CONFIGURACION_O_CONEXION');
  process.exitCode = 1;
}
