'use client';

import { useSyncExternalStore } from 'react';

// Instalación de la PWA. Chrome/Edge/Android emiten `beforeinstallprompt` (puede llegar antes de que React
// monte la pantalla, por eso se escucha al cargar este módulo); iOS no lo emite y se instala desde Compartir.
type EventoInstalacion = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export type EstadoInstalacion = 'instalada' | 'disponible' | 'ios' | 'manual';

let pendiente: EventoInstalacion | null = null;
let instalada = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(oyente => oyente());

const enModoApp = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault();
    pendiente = evento as EventoInstalacion;
    avisar();
  });
  window.addEventListener('appinstalled', () => { pendiente = null; instalada = true; avisar(); });
}

/** Registra el service worker en producción; en desarrollo quita cualquiera previo para no servir código viejo. */
export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV === 'production') {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(error => console.error('No se pudo registrar el service worker:', (error as Error).message));
  } else {
    void navigator.serviceWorker.getRegistrations().then(registros => registros.forEach(registro => void registro.unregister()));
  }
}

function estadoActual(): EstadoInstalacion {
  if (instalada || enModoApp()) return 'instalada';
  if (pendiente) return 'disponible';
  return esIOS() ? 'ios' : 'manual';
}

/** Muestra el diálogo nativo de instalación si el navegador lo ofreció. Devuelve si el usuario aceptó. */
export async function instalarApp() {
  if (!pendiente) return false;
  const evento = pendiente;
  pendiente = null;
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  if (outcome === 'accepted') instalada = true;
  avisar();
  return outcome === 'accepted';
}

export function useEstadoInstalacion() {
  return useSyncExternalStore(
    oyente => { oyentes.add(oyente); return () => { oyentes.delete(oyente); }; },
    estadoActual,
    () => 'manual' as const,
  );
}
