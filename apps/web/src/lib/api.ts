export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string, public detalles?: unknown) {
    super(mensaje);
  }
}

// Cliente mínimo para la API Hono, servida en /api del mismo origen mediante rewrites de Next.
export async function solicitarApi<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
      headers: opciones.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
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
