import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt de Node evita dependencias nativas. Formato: scrypt$N$r$p$sal$hash (base64url).
const PARAMETROS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions;
const LONGITUD_HASH = 32;

function derivar(contrasena: string, sal: Buffer, opciones: ScryptOptions) {
  return new Promise<Buffer>((resolver, rechazar) => {
    scrypt(contrasena.normalize('NFKC'), sal, LONGITUD_HASH, opciones, (error, clave) => error ? rechazar(error) : resolver(clave));
  });
}

export async function hashearContrasena(contrasena: string) {
  const sal = randomBytes(16);
  const hash = await derivar(contrasena, sal, PARAMETROS);
  return ['scrypt', PARAMETROS.N, PARAMETROS.r, PARAMETROS.p, sal.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verificarContrasena(contrasena: string, almacenado: string) {
  const [algoritmo, N, r, p, sal, hash] = almacenado.split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64url');
  const calculado = await derivar(contrasena, Buffer.from(sal, 'base64url'),
    { N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMETROS.maxmem });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

// Hash válido de una contraseña aleatoria: iguala el tiempo de respuesta cuando la cuenta no existe.
let hashFicticio: Promise<string> | undefined;
export function obtenerHashFicticio() {
  hashFicticio ??= hashearContrasena(randomBytes(24).toString('base64url'));
  return hashFicticio;
}

export const generarToken = () => randomBytes(32).toString('base64url');
export const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');
export const generarCodigoOtp = (digitos: number) => String(randomInt(0, 10 ** digitos)).padStart(digitos, '0');

export function igualesSeguro(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
