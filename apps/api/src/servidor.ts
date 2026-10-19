import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { serve } from '@hono/node-server';
import { crearApp } from './app';
import { validarConfiguracionServidor } from './configuracion';
import { crearBaseDatos } from './db/cliente';
import { crearEnviadorConsola, crearEnviadorResend } from './correo/enviador';
import { crearAlmacenLocal } from './almacen/local';
import { crearAlmacenSupabase } from './almacen/supabase';

// Igual que las herramientas de BD: el .env raíz no sobrescribe variables ya presentes.
try { loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo cargar .env'); }

const configuracion = validarConfiguracionServidor(process.env);
const { bd, cerrar } = crearBaseDatos(configuracion.DATABASE_URL);
if (!configuracion.resend) console.warn('RESEND_API_KEY no configurada: los correos OTP se mostrarán en consola (solo desarrollo).');
const enviador = configuracion.resend ? crearEnviadorResend(configuracion.resend) : crearEnviadorConsola();

if (!configuracion.storage) console.warn('Supabase Storage no configurado: las fotos se guardan en .almacen-local (solo desarrollo).');
const almacen = configuracion.storage
  ? crearAlmacenSupabase(configuracion.storage)
  : crearAlmacenLocal({ directorio: fileURLToPath(new URL('../../../.almacen-local', import.meta.url)) });

const app = crearApp({ bd, enviador, almacen, produccion: configuracion.produccion });
const servidor = serve({ fetch: app.fetch, port: configuracion.puerto, hostname: configuracion.host }, info => {
  console.info(`API Easyway escuchando en http://${configuracion.host}:${info.port}/api`);
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(senal, () => { servidor.close(); void cerrar(); });
}
