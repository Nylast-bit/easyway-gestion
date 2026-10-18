import { hashearContrasena } from '../../apps/api/src/auth/criptografia.js';
import { conectar, informarError } from './conexion.js';

// Seed idempotente del primer administrador. Los datos llegan por variables de entorno
// (no argumentos) para que la contraseña no quede en el historial de la terminal.
const nombre = process.env.ADMIN_NOMBRE?.trim() || 'Administrador';
const usuario = process.env.ADMIN_USUARIO?.trim().toLowerCase() || null;
const correo = process.env.ADMIN_CORREO?.trim().toLowerCase() || null;
const contrasena = process.env.ADMIN_CONTRASENA ?? '';

class ErrorEntrada extends Error {}

try {
  if (!usuario && !correo) throw new ErrorEntrada('Define ADMIN_USUARIO o ADMIN_CORREO');
  if (usuario && !/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new ErrorEntrada('ADMIN_USUARIO: 3-40 letras minúsculas, números, punto, guion o guion bajo');
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorEntrada('ADMIN_CORREO no es un correo válido');
  if (contrasena.length < 10) throw new ErrorEntrada('ADMIN_CONTRASENA necesita al menos 10 caracteres');

  const cliente = conectar();
  try {
    const [existente] = await cliente`SELECT 1 FROM usuarios WHERE rol = 'admin' LIMIT 1`;
    if (existente) console.log('Ya existe un administrador; no se modificó nada.');
    else {
      const hash = await hashearContrasena(contrasena);
      await cliente`INSERT INTO usuarios (nombre, usuario, correo, contrasena_hash, rol)
        VALUES (${nombre}, ${usuario}, ${correo}, ${hash}, 'admin')`;
      console.log(correo
        ? 'Administrador creado. Verificará su correo con un código OTP en el primer inicio de sesión.'
        : 'Administrador creado.');
    }
  } finally {
    await cliente.end();
  }
} catch (error) {
  if (error instanceof ErrorEntrada) { console.error(error.message); process.exitCode = 1; }
  else informarError(error);
}
