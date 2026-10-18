import { createClient } from '@supabase/supabase-js';
import { validarRuta, type AlmacenArchivos } from './almacen';

// Solo backend: usa la clave secreta. El bucket es privado y se sirve con URLs firmadas.
export function crearAlmacenSupabase(opciones: { url: string; claveSecreta: string; bucket: string; fetch?: typeof fetch }): AlmacenArchivos {
  const cliente = createClient(opciones.url, opciones.claveSecreta, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(opciones.fetch ? { global: { fetch: opciones.fetch } } : {}),
  });
  const bucket = () => cliente.storage.from(opciones.bucket);
  // Los mensajes de Storage no incluyen credenciales; se resumen para no filtrar detalles internos.
  const fallo = (operacion: string, error: { message?: string }) => new Error(`Storage: no se pudo ${operacion} (${error.message ?? 'error desconocido'})`);

  return {
    async subir(ruta, datos, tipo) {
      const { error } = await bucket().upload(validarRuta(ruta), datos, { contentType: tipo, upsert: false, cacheControl: '3600' });
      if (error) throw fallo('subir el archivo', error);
    },
    async urlsTemporales(rutas, segundos) {
      const resultado = new Map<string, string>();
      if (!rutas.length) return resultado;
      const { data, error } = await bucket().createSignedUrls(rutas.map(validarRuta), segundos);
      if (error) throw fallo('firmar enlaces', error);
      for (const fila of data ?? []) if (fila.path && fila.signedUrl && !fila.error) resultado.set(fila.path, fila.signedUrl);
      return resultado;
    },
    async borrar(rutas) {
      if (!rutas.length) return;
      const { error } = await bucket().remove(rutas.map(validarRuta));
      if (error) throw fallo('borrar archivos', error);
    },
  };
}
