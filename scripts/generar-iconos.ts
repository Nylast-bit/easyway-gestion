// Genera los iconos de la PWA (apps/web/public/iconos) a partir de un SVG con la marca.
// Uso: npx tsx scripts/generar-iconos.ts — renderiza con el Chromium de Playwright, sin dependencias nuevas.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const DESTINO = 'apps/web/public/iconos';

// Fondo con el degradado de la marca y una "E" con un punto de ubicación.
// `seguro` reduce el contenido al 70 % para los iconos maskable (Android recorta hasta un círculo).
function svg(redondeado: boolean, seguro = 1) {
  const escala = seguro;
  const desplazamiento = (512 * (1 - escala)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00b494"/><stop offset="1" stop-color="#008f76"/></linearGradient></defs>
  <rect width="512" height="512" rx="${redondeado ? 112 : 0}" fill="url(#g)"/>
  <g transform="translate(${desplazamiento} ${desplazamiento}) scale(${escala})">
    <path d="M150 112h212v62H222v52h120v60H222v52h140v62H150z" fill="#fff"/>
    <circle cx="372" cy="372" r="34" fill="#d2f9f0"/>
    <circle cx="372" cy="372" r="14" fill="#008f76"/>
  </g>
</svg>`;
}

const iconos = [
  { archivo: 'icono-192.png', tamano: 192, svg: svg(true) },
  { archivo: 'icono-512.png', tamano: 512, svg: svg(true) },
  { archivo: 'icono-maskable-512.png', tamano: 512, svg: svg(false, 0.7) },
  // iOS aplica su propio redondeado: el icono va a sangre.
  { archivo: 'apple-touch-icon.png', tamano: 180, svg: svg(false, 0.85) },
];

mkdirSync(DESTINO, { recursive: true });
writeFileSync(`${DESTINO}/icono.svg`, svg(true));
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const icono of iconos) {
  await pagina.setViewportSize({ width: icono.tamano, height: icono.tamano });
  await pagina.setContent(`<html><body style="margin:0;background:transparent">${icono.svg.replace('<svg ', `<svg width="${icono.tamano}" height="${icono.tamano}" `)}</body></html>`);
  await pagina.screenshot({ path: `${DESTINO}/${icono.archivo}`, omitBackground: true });
  console.log(`${DESTINO}/${icono.archivo}`);
}
await navegador.close();
