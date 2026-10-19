import { TAMANO_MAXIMO_FOTO } from '@easyway/shared';

export const TIPOS_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
// Las fotos de móvil suelen pesar 3-12 MB: por encima de esto se reducen antes de subirlas.
const LIMITE_SIN_REDUCIR = 1.5 * 1024 * 1024;
const LADO_MAXIMO = 1920;

/** Error de una foto concreta, con un mensaje listo para mostrar. */
export class ErrorFoto extends Error {}

/** Imágenes de mapa de bits (o tipo vacío, como algunos HEIC en Android); SVG y otros archivos no. */
export const esFotoPosible = (archivo: File) => archivo.type === '' || (archivo.type.startsWith('image/') && archivo.type !== 'image/svg+xml');

/**
 * Deja la foto lista para subir: si pesa mucho o el formato no se admite (p. ej. HEIC), la redibuja como JPEG
 * de hasta 1920 px respetando la orientación de la cámara. Si el navegador no puede decodificarla, se envía tal cual
 * cuando es válida; si no, error con el nombre del archivo.
 */
export async function prepararFoto(archivo: File): Promise<File> {
  if (!esFotoPosible(archivo)) throw new ErrorFoto(`${archivo.name}: usa JPG, PNG o WebP`);
  const admitido = TIPOS_ADMITIDOS.includes(archivo.type);
  if (admitido && archivo.size <= LIMITE_SIN_REDUCIR) return archivo;
  try {
    const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    imagen.close();
    const blob = await new Promise<Blob | null>(resolver => lienzo.toBlob(resolver, 'image/jpeg', 0.82));
    if (!blob) throw new Error('sin datos');
    return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: archivo.lastModified });
  } catch {
    if (admitido && archivo.size <= TAMANO_MAXIMO_FOTO) return archivo;
    throw new ErrorFoto(`${archivo.name}: no se pudo procesar; usa JPG, PNG o WebP de hasta ${TAMANO_MAXIMO_FOTO / 1024 / 1024} MB`);
  }
}
