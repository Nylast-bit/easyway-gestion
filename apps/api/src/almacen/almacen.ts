// Interfaz de archivos independiente del proveedor (Supabase Storage hoy; MinIO u otro en el futuro).
// Las rutas son claves internas; nunca se exponen URLs permanentes.
export interface AlmacenArchivos {
  subir(ruta: string, datos: Uint8Array, tipo: string): Promise<void>;
  /** URL temporal de solo lectura por ruta. Las rutas inexistentes pueden omitirse. */
  urlsTemporales(rutas: string[], segundos: number): Promise<Map<string, string>>;
  borrar(rutas: string[]): Promise<void>;
  /** Solo almacenes locales: resuelve un enlace firmado servido por la propia API. */
  leerFirmado?(token: string): Promise<{ datos: Uint8Array; tipo: string } | null>;
}

const RUTA_VALIDA = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;

export function validarRuta(ruta: string) {
  if (!RUTA_VALIDA.test(ruta) || ruta.includes('..') || ruta.includes('//')) throw new Error('Ruta de archivo inválida');
  return ruta;
}

export const TIPOS_IMAGEN = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type TipoImagen = keyof typeof TIPOS_IMAGEN;

// Se confía en la firma del contenido, no en el Content-Type ni en la extensión enviados por el cliente.
export function detectarTipoImagen(datos: Uint8Array): TipoImagen | null {
  const empieza = (...bytes: number[]) => bytes.every((b, i) => datos[i] === b);
  if (empieza(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (empieza(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...datos.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
