// Service worker de la PWA de Easyway GPS.
// Reglas: nunca intercepta /api (sesión, datos y fotos van siempre a la red) ni guarda páginas del portal,
// que dependen de la sesión. Solo cachea archivos estáticos con hash de Next, los iconos y la página sin conexión.
const VERSION = 'easyway-v1';
const PRECARGA = ['/offline.html', '/iconos/icono-192.png', '/iconos/icono-512.png'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(VERSION).then(cache => cache.addAll(PRECARGA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(clave => clave !== VERSION).map(clave => caches.delete(clave))))
      .then(() => self.clients.claim()),
  );
});

async function primeroCache(peticion) {
  const guardada = await caches.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) {
    const cache = await caches.open(VERSION);
    await cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

self.addEventListener('fetch', evento => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navegación: siempre a la red; sin conexión, la página de aviso.
  if (request.mode === 'navigate') {
    evento.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }
  // Archivos con hash en el nombre (no cambian) e iconos: primero la caché.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/iconos/')) {
    evento.respondWith(primeroCache(request));
  }
});

// Cola sin conexión del técnico (Background Sync, Chrome/Android). La página guarda en IndexedDB los trabajos
// que no pudo enviar (src/lib/colaCampo.ts: misma base, almacén y forma) y registra esta etiqueta.
// Al volver la señal: si la app está abierta, se le avisa y ella envía; si está cerrada, envía el service worker.
// Esto no intercepta /api: son peticiones propias del service worker, que el evento fetch no ve.
const BASE_COLA = 'easyway-campo';
const ALMACEN_COLA = 'borradores';
const ETIQUETA_SYNC = 'easyway-cola-campo';

self.addEventListener('sync', evento => {
  if (evento.tag === ETIQUETA_SYNC) evento.waitUntil(sincronizarCola());
});

function abrirCola() {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE_COLA, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN_COLA, { keyPath: 'clave' });
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function operarCola(bd, modo, accion) {
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(ALMACEN_COLA, modo);
    const peticion = accion(tx.objectStore(ALMACEN_COLA));
    tx.oncomplete = () => resolver(peticion.result);
    tx.onerror = () => rechazar(tx.error);
  });
}

// Sin señal, servidor caído o sesión vencida: se lanza para que el navegador reintente el sync más tarde.
const transitorio = estado => estado === 401 || estado === 408 || estado === 429 || estado >= 500;

async function sincronizarCola() {
  const ventanas = await self.clients.matchAll({ type: 'window' });
  if (ventanas.length) {
    ventanas.forEach(ventana => ventana.postMessage({ tipo: ETIQUETA_SYNC }));
    return;
  }
  const sesion = await fetch('/api/auth/sesion', { credentials: 'same-origin' });
  if (!sesion.ok) return; // Sin sesión: se enviará al abrir la app (y al cerrar sesión la cola se vacía).
  const { usuario } = await sesion.json();
  const bd = await abrirCola();
  try {
    const todos = await operarCola(bd, 'readonly', almacen => almacen.getAll());
    // Solo los de la cuenta con sesión, del más antiguo al más reciente; los rechazados esperan a "Reintentar".
    const propios = todos.filter(b => b.usuario_id === usuario.id && !b.error).sort((a, b) => a.creado.localeCompare(b.creado));
    for (const borrador of propios) {
      const guardar = () => operarCola(bd, 'readwrite', almacen => almacen.put(borrador));
      if (borrador.trabajo_id === null) {
        const r = await fetch('/api/campo/trabajos', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(borrador.cuerpo),
        });
        if (transitorio(r.status)) throw new Error(`Envío pospuesto (${r.status})`);
        const datos = await r.json().catch(() => null);
        if (!r.ok) {
          borrador.error = (datos && datos.error) || 'Solicitud rechazada';
          await guardar();
          continue;
        }
        borrador.trabajo_id = datos.id;
        await guardar();
      }
      while (borrador.fotos.length) {
        const foto = borrador.fotos[0];
        const formulario = new FormData();
        formulario.set('archivo', new File([foto.datos], foto.nombre, { type: foto.tipo }));
        const r = await fetch(`/api/fotos/trabajo/${borrador.trabajo_id}`, { method: 'POST', credentials: 'same-origin', body: formulario });
        if (transitorio(r.status)) throw new Error(`Envío pospuesto (${r.status})`);
        if (!r.ok) borrador.fotos_fallidas++;
        borrador.fotos.shift();
        await guardar();
      }
      await operarCola(bd, 'readwrite', almacen => almacen.delete(borrador.clave));
    }
  } finally {
    bd.close();
  }
}
