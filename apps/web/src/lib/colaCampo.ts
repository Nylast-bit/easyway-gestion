'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import type { TrabajoCampo } from '@easyway/shared';
import { ErrorApi, solicitarApi } from './api';

// Cola sin conexión del técnico: si al pulsar "Enviar trabajo" no hay señal, el trabajo (datos y fotos ya
// reducidas) se guarda en IndexedDB del teléfono y se envía al volver la conexión: evento `online`, aviso del
// service worker (Background Sync) o "Reintentar". Orden: POST /campo/trabajos y luego una foto por petición.
// Cada borrador lleva `clave_idempotencia`: si se pierde la respuesta y se reenvía, la API devuelve el mismo trabajo.
// public/sw.js lee esta misma base (BASE, ALMACEN y forma de Borrador): cambiarlas a la vez.

const BASE = 'easyway-campo';
const ALMACEN = 'borradores';
export const ETIQUETA_SYNC = 'easyway-cola-campo';

export interface FotoBorrador { nombre: string; tipo: string; datos: ArrayBuffer }

export interface Borrador {
  clave: string;
  usuario_id: number;
  creado: string;
  /** Cuerpo de POST /campo/trabajos, con clave_idempotencia = clave. */
  cuerpo: Record<string, unknown>;
  /** Lo que se muestra en "Mis trabajos" mientras no se envía. */
  resumen: { tipo: string; cliente: string; vehiculo: string; imei: string; fecha: string | null };
  /** Id del trabajo una vez creado: los reintentos solo suben las fotos que faltan. */
  trabajo_id: number | null;
  fotos: FotoBorrador[];
  fotos_fallidas: number;
  /** Rechazo de la API que no se arregla reintentando (p. ej. datos inválidos); null si solo falta señal. */
  error: string | null;
}

/** Sin señal, servidor caído o sesión vencida: se reintenta más tarde sin marcar error. */
export const esFalloTransitorio = (error: unknown) =>
  error instanceof ErrorApi && (error.estado === 0 || error.estado === 401 || error.estado === 408 || error.estado === 429 || error.estado >= 500);

export const sinConexion = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function nuevaClave() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // HTTP en la red local (sin contexto seguro) no tiene randomUUID: UUID v4 a partir de bytes aleatorios.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function aFotoBorrador(archivo: File): Promise<FotoBorrador> {
  return { nombre: archivo.name, tipo: archivo.type || 'image/jpeg', datos: await archivo.arrayBuffer() };
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') return rechazar(new Error('Este navegador no permite guardar trabajos sin conexión'));
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => { peticion.result.createObjectStore(ALMACEN, { keyPath: 'clave' }); };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, accion: (almacen: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const bd = await abrir();
  try {
    return await new Promise<T | undefined>((resolver, rechazar) => {
      const tx = bd.transaction(ALMACEN, modo);
      const peticion = accion(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolver(peticion ? peticion.result : undefined);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error ?? new Error('No se pudo guardar en el teléfono'));
    });
  } finally { bd.close(); }
}

const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(oyente => oyente());
/** Se llama cada vez que la cola cambia (guardado, envío, descarte). */
export function suscribirCola(oyente: () => void) {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

export async function guardarBorrador(borrador: Borrador) {
  await operar('readwrite', almacen => almacen.put(borrador));
  avisar();
  // Background Sync (Chrome/Android): el service worker avisa o envía aunque la app esté cerrada.
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    await (registro as (ServiceWorkerRegistration & { sync?: { register(etiqueta: string): Promise<void> } }) | undefined)?.sync?.register(ETIQUETA_SYNC);
  } catch { /* sin Background Sync: basta el evento online */ }
}

/** Borradores de esta cuenta, del más antiguo al más reciente. Los de otra cuenta no se muestran ni se envían. */
export async function listarBorradores(usuarioId: number): Promise<Borrador[]> {
  const todos = (await operar<Borrador[]>('readonly', almacen => almacen.getAll() as IDBRequest<Borrador[]>)) ?? [];
  return todos.filter(b => b.usuario_id === usuarioId).sort((a, b) => a.creado.localeCompare(b.creado));
}

export async function descartarBorrador(clave: string) {
  await operar('readwrite', almacen => almacen.delete(clave));
  avisar();
}

/** Al cerrar sesión: el teléfono no conserva trabajos de nadie. */
export async function vaciarCola() {
  await operar('readwrite', almacen => almacen.clear());
  avisar();
}

/**
 * Envía un borrador: crea el trabajo (si aún no se creó) y sube las fotos pendientes una a una.
 * Con `guardado`, cada avance se refleja en IndexedDB para que un corte no repita lo ya enviado.
 * Lanza el error si falta señal o la API rechaza el trabajo; una foto rechazada se cuenta y se sigue.
 */
export async function enviarBorrador(borrador: Borrador, opciones: { guardado: boolean; progreso?: (texto: string) => void }) {
  const persistir = async () => { if (opciones.guardado) await operar('readwrite', almacen => almacen.put(borrador)); };
  if (borrador.trabajo_id === null) {
    opciones.progreso?.('Enviando…');
    const creado = await solicitarApi<TrabajoCampo>('/campo/trabajos', { cuerpo: borrador.cuerpo });
    borrador.trabajo_id = creado.id;
    borrador.error = null;
    await persistir();
  }
  const total = borrador.fotos.length;
  while (borrador.fotos.length) {
    const foto = borrador.fotos[0];
    opciones.progreso?.(`Subiendo fotos ${total - borrador.fotos.length + 1}/${total}…`);
    try {
      const formulario = new FormData();
      formulario.set('archivo', new File([foto.datos], foto.nombre, { type: foto.tipo }));
      await solicitarApi(`/fotos/trabajo/${borrador.trabajo_id}`, { cuerpo: formulario });
    } catch (error) {
      if (esFalloTransitorio(error)) throw error;
      borrador.fotos_fallidas++;
    }
    borrador.fotos.shift();
    await persistir();
  }
  if (opciones.guardado) await descartarBorrador(borrador.clave);
  return { trabajo_id: borrador.trabajo_id, fotos_fallidas: borrador.fotos_fallidas };
}

let enCurso: Promise<{ enviados: number; fotos_fallidas: number }> | null = null;

/**
 * Envía los borradores de la cuenta en orden. Solo una pasada a la vez (online, service worker y "Reintentar"
 * pueden coincidir). Se detiene al primer fallo de señal; un rechazo queda anotado en el borrador.
 */
export function enviarPendientes(usuarioId: number, opciones: { conError?: boolean } = {}) {
  enCurso ??= (async () => {
    let enviados = 0, fotos_fallidas = 0;
    try {
      for (const borrador of await listarBorradores(usuarioId)) {
        // Un rechazo no se arregla solo: las pasadas automáticas lo saltan y "Reintentar" lo incluye.
        if (borrador.error && !opciones.conError) continue;
        try {
          const resultado = await enviarBorrador(borrador, { guardado: true });
          enviados++;
          fotos_fallidas += resultado.fotos_fallidas;
        } catch (error) {
          if (esFalloTransitorio(error)) break;
          borrador.error = error instanceof Error ? error.message : 'No se pudo enviar';
          await operar('readwrite', almacen => almacen.put(borrador));
        }
      }
    } finally {
      enCurso = null;
      avisar();
    }
    return { enviados, fotos_fallidas };
  })();
  return enCurso;
}

/**
 * Envío automático para la cuenta técnica (MainLayout): al abrir la app, al volver la señal y cuando el
 * service worker avisa por Background Sync. Avisa con un toast de lo que salió.
 */
export function useEnvioAutomatico(usuarioId: number | null) {
  useEffect(() => {
    if (usuarioId === null) return;
    const intentar = () => {
      if (sinConexion()) return;
      enviarPendientes(usuarioId).then(({ enviados, fotos_fallidas }) => {
        if (enviados) toast.success(enviados === 1 ? 'Se envió el trabajo guardado sin señal' : `Se enviaron ${enviados} trabajos guardados sin señal`);
        if (fotos_fallidas) toast.error(`${fotos_fallidas} foto(s) no se pudieron subir; agrégalas desde “Mis trabajos”.`);
      }).catch(() => { /* sin IndexedDB: no hay cola */ });
    };
    const mensaje = (evento: MessageEvent) => { if ((evento.data as { tipo?: string } | null)?.tipo === ETIQUETA_SYNC) intentar(); };
    intentar();
    window.addEventListener('online', intentar);
    navigator.serviceWorker?.addEventListener('message', mensaje);
    return () => {
      window.removeEventListener('online', intentar);
      navigator.serviceWorker?.removeEventListener('message', mensaje);
    };
  }, [usuarioId]);
}
