import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { igualesSeguro } from '../auth/criptografia';
import { TIPOS_IMAGEN, validarRuta, type AlmacenArchivos } from './almacen';

const TIPO_POR_EXTENSION: Record<string, string> = Object.fromEntries(Object.entries(TIPOS_IMAGEN).map(([tipo, ext]) => [ext, tipo]));

/**
 * Almacén en disco para desarrollo y pruebas, con el mismo contrato que Supabase:
 * los enlaces caducan y van firmados (HMAC con secreto aleatorio por proceso),
 * así que reiniciar la API invalida los enlaces emitidos.
 */
export function crearAlmacenLocal(opciones: { directorio: string; prefijoUrl?: string; reloj?: () => Date }): AlmacenArchivos {
  const raiz = resolve(opciones.directorio);
  const secreto = randomBytes(32);
  const prefijo = opciones.prefijoUrl ?? '/api/archivos';
  const ahora = () => (opciones.reloj ?? (() => new Date()))().getTime();
  const firmar = (carga: string) => createHmac('sha256', secreto).update(carga).digest('base64url');
  const archivo = (ruta: string) => {
    const destino = resolve(raiz, validarRuta(ruta));
    if (!destino.startsWith(raiz + sep)) throw new Error('Ruta de archivo inválida');
    return destino;
  };

  return {
    async subir(ruta, datos) {
      const destino = archivo(ruta);
      await mkdir(dirname(destino), { recursive: true });
      // flag wx: igual que upsert:false en Supabase, no sobrescribe un archivo existente.
      await writeFile(destino, datos, { flag: 'wx' });
    },
    async urlsTemporales(rutas, segundos) {
      const expira = ahora() + segundos * 1000;
      return new Map(rutas.map(ruta => {
        const carga = Buffer.from(JSON.stringify({ r: validarRuta(ruta), e: expira })).toString('base64url');
        return [ruta, `${prefijo}/${carga}.${firmar(carga)}`];
      }));
    },
    async borrar(rutas) {
      await Promise.all(rutas.map(ruta => rm(archivo(ruta), { force: true })));
    },
    async leerFirmado(token) {
      const [carga, firma] = token.split('.');
      if (!carga || !firma || !igualesSeguro(firma, firmar(carga))) return null;
      let datos: { r: string; e: number };
      try { datos = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')); } catch { return null; }
      if (typeof datos.e !== 'number' || datos.e < ahora()) return null;
      try {
        return { datos: await readFile(archivo(datos.r)), tipo: TIPO_POR_EXTENSION[datos.r.split('.').pop() ?? ''] ?? 'application/octet-stream' };
      } catch { return null; }
    },
  };
}
