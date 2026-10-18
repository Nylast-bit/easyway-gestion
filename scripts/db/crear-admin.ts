import { createInterface, type Interface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { hashearContrasena } from '../../apps/api/src/auth/criptografia.js';
import { conectar, informarError } from './conexion.js';

// Seed idempotente del primer administrador. Sin variables ADMIN_* pregunta en la terminal
// (contraseña oculta); con ellas funciona sin interacción para automatizar. La contraseña
// nunca va como argumento, para que no quede en el historial de la terminal.
class ErrorEntrada extends Error {}

type InterfazConEco = Interface & { _writeToOutput: (texto: string) => void };
let rl: InterfazConEco | undefined;
let ocultar = false;

function abrirTerminal() {
  rl = createInterface({ input: stdin, output: stdout, terminal: true }) as InterfazConEco;
  // Al preguntar la contraseña se silencia el eco: solo se muestra la pregunta.
  const escribirOriginal = rl._writeToOutput.bind(rl);
  rl._writeToOutput = texto => { if (!ocultar || texto.endsWith(': ')) escribirOriginal(texto); };
  return rl;
}

function preguntar(texto: string, { secreto = false, porDefecto = '' } = {}) {
  const interfaz = rl ?? abrirTerminal();
  return new Promise<string>(resolver => {
    ocultar = false;
    interfaz.question(porDefecto ? `${texto} [${porDefecto}]: ` : `${texto}: `, respuesta => {
      ocultar = false;
      if (secreto) stdout.write('\n');
      resolver(respuesta.trim() || porDefecto);
    });
    ocultar = secreto;
  });
}

async function leerDatos() {
  if (process.env.ADMIN_CONTRASENA !== undefined) {
    return {
      nombre: process.env.ADMIN_NOMBRE?.trim() || 'Administrador',
      usuario: process.env.ADMIN_USUARIO?.trim().toLowerCase() || null,
      correo: process.env.ADMIN_CORREO?.trim().toLowerCase() || null,
      contrasena: process.env.ADMIN_CONTRASENA,
    };
  }
  if (!stdin.isTTY) throw new ErrorEntrada('Define ADMIN_USUARIO o ADMIN_CORREO y ADMIN_CONTRASENA, o ejecuta el comando en una terminal interactiva');
  console.log('Crear el primer administrador de Easyway GPS Gestión.');
  console.log('Con correo, el primer inicio de sesión pedirá el código enviado a ese correo.\n');
  const nombre = await preguntar('Nombre completo', { porDefecto: 'Administrador' });
  const usuario = (await preguntar('Usuario (opcional si das correo)')).toLowerCase() || null;
  const correo = (await preguntar('Correo (opcional si das usuario)')).toLowerCase() || null;
  const contrasena = await preguntar('Contraseña (mínimo 10 caracteres)', { secreto: true });
  const confirmacion = await preguntar('Repite la contraseña', { secreto: true });
  if (contrasena !== confirmacion) throw new ErrorEntrada('Las contraseñas no coinciden');
  return { nombre, usuario, correo, contrasena };
}

try {
  const { nombre, usuario, correo, contrasena } = await leerDatos();
  if (!usuario && !correo) throw new ErrorEntrada('Indica un usuario o un correo');
  if (usuario && !/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new ErrorEntrada('Usuario: 3-40 letras minúsculas, números, punto, guion o guion bajo');
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorEntrada('El correo no es válido');
  if (contrasena.length < 10) throw new ErrorEntrada('La contraseña necesita al menos 10 caracteres');

  const cliente = conectar();
  try {
    const [existente] = await cliente`SELECT 1 FROM usuarios WHERE rol = 'admin' LIMIT 1`;
    if (existente) console.log('Ya existe un administrador; no se modificó nada. Crea más cuentas desde la pantalla Usuarios.');
    else {
      const hash = await hashearContrasena(contrasena);
      await cliente`INSERT INTO usuarios (nombre, usuario, correo, contrasena_hash, rol)
        VALUES (${nombre}, ${usuario}, ${correo}, ${hash}, 'admin')`;
      console.log(correo
        ? `Administrador creado. Entra con ${usuario ?? correo}; se enviará un código a ${correo} la primera vez.`
        : `Administrador creado. Entra con el usuario ${usuario}.`);
    }
  } finally {
    await cliente.end();
  }
} catch (error) {
  if (error instanceof ErrorEntrada) { console.error(error.message); process.exitCode = 1; }
  else if ((error as { code?: string }).code === '23505') { console.error('Ya existe una cuenta con ese usuario o correo.'); process.exitCode = 1; }
  else informarError(error);
} finally {
  rl?.close();
}
