import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_SESION = 'easyway_sesion';

// Comprobación optimista: sin cookie no se muestra el portal. La validez real
// de la sesión la decide la API (MainLayout redirige al login si responde 401).
export function proxy(request: NextRequest) {
  if (request.cookies.has(COOKIE_SESION)) return NextResponse.next();
  const destino = new URL('/login', request.url);
  const actual = request.nextUrl.pathname + request.nextUrl.search;
  if (actual !== '/') destino.searchParams.set('siguiente', actual);
  return NextResponse.redirect(destino);
}

export const config = {
  // Archivos públicos de la PWA (manifiesto, service worker, iconos, página sin conexión) no requieren sesión.
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.svg|icons.svg|manifest.webmanifest|sw.js|offline.html|iconos/).*)'],
};
