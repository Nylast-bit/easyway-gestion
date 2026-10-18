export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string, public detalles?: unknown) {
    super(mensaje);
  }
}

// Cliente mínimo para la API Hono, servida en /api del mismo origen mediante rewrites de Next.
export async function solicitarApi<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  let respuesta: Response;
  // FormData (subida de archivos) viaja como multipart: el navegador pone el Content-Type con su boundary.
  const formulario = opciones.cuerpo instanceof FormData;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
      headers: opciones.cuerpo === undefined || formulario ? undefined : { 'Content-Type': 'application/json' },
      body: opciones.cuerpo === undefined ? undefined : formulario ? opciones.cuerpo as FormData : JSON.stringify(opciones.cuerpo),
      credentials: 'same-origin',
    });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }
  if (respuesta.status === 204) return undefined as T;
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = (datos as { error?: string } | null)?.error
      ?? (respuesta.status >= 500 ? 'El servidor no está disponible. Intenta de nuevo en unos minutos.' : 'Solicitud rechazada');
    throw new ErrorApi(respuesta.status, mensaje, (datos as { detalles?: unknown } | null)?.detalles);
  }
  return datos as T;
}

export const mensajeError = (error: unknown, alternativo = 'Ocurrió un error inesperado') =>
  error instanceof ErrorApi ? error.message : alternativo;

// <input type="datetime-local"> trabaja en hora local sin zona; la API guarda instantes ISO.
export function aFechaHoraLocal(iso: string | null | undefined) {
  const fecha = iso ? new Date(iso) : new Date();
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export const desdeFechaHoraLocal = (valor: string) => (valor ? new Date(valor).toISOString() : null);

export const formatearFecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' }) : 'Sin fecha';

// Importes en pesos dominicanos: RD$5,500.00
export const formatearDinero = (monto: number) =>
  `RD$${monto.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fechas de calendario (YYYY-MM-DD) sin conversión de zona: 2026-11-01 → 01/11/2026.
export const formatearDia = (fecha: string | null | undefined) =>
  fecha ? fecha.split('-').reverse().join('/') : 'Sin fecha';
