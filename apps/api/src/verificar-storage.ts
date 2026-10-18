import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { crearAlmacenSupabase } from './almacen/supabase';

// Prueba de extremo a extremo del bucket privado con un objeto desechable bajo pruebas/.
// No toca fotos reales. Uso: npm run storage:verificar
try { loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo cargar .env'); }

const url = process.env.SUPABASE_URL;
const claveSecreta = process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'vehicles';
if (!url || !claveSecreta) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY');
  process.exit(1);
}

const almacen = crearAlmacenSupabase({ url, claveSecreta, bucket });
const ruta = `pruebas/verificacion-${randomUUID()}.png`;
// PNG 1×1 transparente.
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
const paso = (texto: string, ok: boolean) => { console.log(`${ok ? '✔' : '✘'} ${texto}`); if (!ok) process.exitCode = 1; };

let subido = false;
try {
  await almacen.subir(ruta, png, 'image/png');
  subido = true;
  paso('Subida al bucket privado', true);

  let duplicado = false;
  try { await almacen.subir(ruta, png, 'image/png'); } catch { duplicado = true; }
  paso('No sobrescribe un objeto existente', duplicado);

  const firmada = (await almacen.urlsTemporales([ruta], 60)).get(ruta);
  paso('URL firmada emitida', Boolean(firmada));
  const descarga = firmada ? await fetch(firmada) : null;
  const bytes = descarga?.ok ? new Uint8Array(await descarga.arrayBuffer()) : new Uint8Array();
  paso('Descarga con URL firmada devuelve el mismo contenido', Buffer.from(bytes).equals(Buffer.from(png)));

  const publica = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${ruta}`);
  paso(`URL pública rechazada (HTTP ${publica.status})`, !publica.ok);

  await almacen.borrar([ruta]);
  subido = false;
  paso('Borrado del objeto de prueba', true);
  const despues = firmada ? await fetch(firmada) : null;
  paso(`URL firmada deja de servir el objeto borrado (HTTP ${despues?.status})`, despues !== null && !despues.ok);
} catch (error) {
  paso(`Error: ${(error as Error).message}`, false);
} finally {
  if (subido) await almacen.borrar([ruta]).catch(() => console.error(`Borra manualmente ${ruta} del bucket ${bucket}`));
}
