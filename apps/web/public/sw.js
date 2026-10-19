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
