import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { prepararAislamiento, usuarioPrueba } from './sesion';

// Revisión visual: captura cada pantalla en cuatro tamaños y detecta desbordes horizontales.
// Ejecutar con `npm run test:capturas`; las imágenes quedan en capturas/<tamaño>/ (ignorado por Git).
const TAMANOS = [
  { nombre: 'movil', width: 390, height: 844, isMobile: true },
  { nombre: 'tablet', width: 820, height: 1180, isMobile: true },
  { nombre: 'laptop', width: 1366, height: 768, isMobile: false },
  { nombre: 'pc', width: 1920, height: 1080, isMobile: false },
] as const;

// Datos con textos largos a propósito: los desbordes aparecen con nombres reales, no con "Ana".
const clientes = [
  { id: 1, nombre: 'Transporte y Logística del Caribe Oriental SRL', telefono: '8095550101', correo: 'operaciones.flota@transportecaribeoriental.com.do', created_at: '2026-10-01T12:00:00Z' },
  { id: 2, nombre: 'María Fernanda De los Santos', telefono: null, correo: null, created_at: '2026-10-02T12:00:00Z' },
];
const tecnicos = [
  { id: 1, nombre: 'Pedro Antonio Martínez Rosario', telefono: '8295551234', correo: 'pedro.martinez@easyway.do', created_at: '2026-10-01T12:00:00Z' },
];
const gps = [
  { id: 11, imei: '863829070755440', modelo: 'Teltonika FMB920', estado: 'Instalado', created_at: '', simcard: { id: 5, numero: '8091802704' }, vehiculo: { id: 7, marca: 'TOYOTA', modelo: 'HILUX DOBLE CABINA', placa: 'L123456' } },
  { id: 12, imei: '863829070755441', modelo: null, estado: 'Disponible', created_at: '', simcard: null, vehiculo: null },
  { id: 13, imei: '863829070755442', modelo: 'Concox GT06N', estado: 'Dañado', created_at: '', simcard: null, vehiculo: null },
];
const vehiculos = [
  { id: 7, cliente_id: 1, cliente_nombre: clientes[0].nombre, marca: 'TOYOTA', modelo: 'HILUX DOBLE CABINA', año: 2022, placa: 'L123456', chasis: 'MR0FB8CD3N0123456', color: 'BLANCO PERLA', gps: { id: 11, imei: gps[0].imei, modelo: gps[0].modelo }, imagenes: 3, miniatura: null, created_at: '' },
  { id: 8, cliente_id: 2, cliente_nombre: clientes[1].nombre, marca: 'HONDA', modelo: 'CR-V', año: null, placa: null, chasis: null, color: null, gps: null, imagenes: 0, miniatura: null, created_at: '' },
];
const simcards = [
  { id: 5, numero: '8091802704', fecha_compra: '2026-01-15', fecha_vencimiento: '2027-01-15', estado: 'Asignada', created_at: '', gps: { id: 11, imei: gps[0].imei } },
  { id: 6, numero: '8295550000', fecha_compra: null, fecha_vencimiento: null, estado: 'Disponible', created_at: '', gps: null },
  { id: 9, numero: '8495551111', fecha_compra: '2025-01-01', fecha_vencimiento: '2026-01-01', estado: 'Vencida', created_at: '', gps: null },
];
const instalaciones = [
  {
    id: 1, vehiculo_id: 7, gps_id: 11, simcard_id: 5, tecnico_id: 1, fecha_instalacion: '2026-10-18T16:30:00.000Z',
    tipo: 'Instalación', asunto: 'Instalación inicial con corte de corriente y botón de pánico', estado: 'Completado', created_at: '',
    notas: 'El cliente solicitó ubicar el equipo bajo el tablero del lado del copiloto. Se probó el corte de motor en ruta.',
    vehiculo: { marca: 'TOYOTA', modelo: 'HILUX DOBLE CABINA', placa: 'L123456', cliente_id: 1, cliente_nombre: clientes[0].nombre },
    gps_imei: gps[0].imei, simcard_numero: '8091802704', tecnico_nombre: tecnicos[0].nombre,
  },
  {
    id: 2, vehiculo_id: 8, gps_id: 12, simcard_id: null, tecnico_id: null, fecha_instalacion: null,
    tipo: 'Mantenimiento', asunto: null, estado: 'En Proceso', created_at: '', notas: null,
    vehiculo: { marca: 'HONDA', modelo: 'CR-V', placa: null, cliente_id: 2, cliente_nombre: clientes[1].nombre },
    gps_imei: gps[1].imei, simcard_numero: null, tecnico_nombre: null,
  },
];

async function simularApi(page: Page) {
  const datos: Record<string, unknown> = {
    '/api/auth/sesion': { usuario: { ...usuarioPrueba, nombre: 'Ana Gabriela Administradora' } },
    '/api/resumen': { clientes: 1284, vehiculos: 1530, gps: 1702, simcards: 1655 },
    '/api/clientes': clientes, '/api/tecnicos': tecnicos, '/api/vehiculos': vehiculos,
    '/api/vehiculos?cliente_id=1': vehiculos.filter(v => v.cliente_id === 1),
    '/api/vehiculos?cliente_id=2': vehiculos.filter(v => v.cliente_id === 2),
    '/api/gps': gps, '/api/gps?estado=Disponible': gps.filter(g => g.estado === 'Disponible'),
    '/api/simcards': simcards, '/api/simcards?estado=Disponible': simcards.filter(s => s.estado === 'Disponible'),
    '/api/simcards/5/historial': [
      { fecha_inicio: '2026-03-01T12:00:00Z', fecha_fin: null, gps: { id: 11, imei: gps[0].imei, modelo: gps[0].modelo } },
      { fecha_inicio: '2026-01-15T12:00:00Z', fecha_fin: '2026-03-01T11:00:00Z', gps: { id: 13, imei: gps[2].imei, modelo: gps[2].modelo } },
    ],
    '/api/instalaciones': instalaciones,
    '/api/buscar?q=car': [
      { tipo: 'cliente', id: 1, etiqueta: clientes[0].nombre },
      { tipo: 'vehiculo', id: 7, etiqueta: 'TOYOTA HILUX DOBLE CABINA (L123456)' },
    ],
  };
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: datos[url.pathname + url.search] ?? [] });
  });
}

for (const tamano of TAMANOS) {
  test.describe(`capturas ${tamano.nombre}`, () => {
    test.use({ viewport: { width: tamano.width, height: tamano.height }, isMobile: tamano.isMobile, hasTouch: tamano.isMobile });

    test(`pantallas en ${tamano.nombre} (${tamano.width}x${tamano.height})`, async ({ page, context }) => {
      const carpeta = `capturas/${tamano.nombre}`;
      mkdirSync(carpeta, { recursive: true });
      const errores: string[] = [];
      page.on('pageerror', error => errores.push(error.message));
      await prepararAislamiento(page);

      // Falla suave: registra el desborde y sigue capturando el resto de pantallas.
      const capturar = async (nombre: string) => {
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: `${carpeta}/${nombre}.png`, fullPage: true });
        const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect.soft(desborde, `${nombre}: desborde horizontal de ${desborde}px en ${tamano.nombre}`).toBeLessThanOrEqual(0);
        // Texto que sobresale de un contenedor con overflow oculto: no desborda la página, pero se corta.
        const recortados = await page.evaluate(() => {
          const resultado: string[] = [];
          for (const elemento of document.querySelectorAll<HTMLElement>('body *:not(input):not(textarea):not(select):not(svg *)')) {
            const texto = [...elemento.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join('').trim();
            if (!texto || getComputedStyle(elemento).textOverflow === 'ellipsis') continue;
            const caja = elemento.getBoundingClientRect();
            if (!caja.width || !caja.height) continue;
            for (let padre = elemento.parentElement; padre && padre !== document.body; padre = padre.parentElement) {
              const estilo = getComputedStyle(padre);
              if (!/hidden|clip/.test(estilo.overflowX)) {
                // Un ancestro fijo (panel, modal) no lo recortan los contenedores de más arriba.
                if (estilo.position === 'fixed') break;
                continue;
              }
              const limite = padre.getBoundingClientRect();
              if (caja.right > limite.right + 1 || caja.left < limite.left - 1) resultado.push(texto.slice(0, 50));
              break;
            }
          }
          return resultado;
        });
        expect.soft(recortados, `${nombre}: texto recortado en ${tamano.nombre}`).toEqual([]);
      };

      // Login y verificación por OTP (sin sesión).
      await page.route('**/api/auth/login', route => route.fulfill({
        status: 202, json: { estado: 'verificacion_requerida', desafio: 'd'.repeat(43), correo: 'an•••@magna.com.do', reintentarEn: 60 },
      }));
      await page.goto('/login');
      await capturar('01-login');
      await page.getByLabel('Usuario o correo').fill('ana@magna.com.do');
      await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByRole('heading', { name: 'Verifica tu correo' })).toBeVisible();
      await capturar('02-verificar-correo');

      // Portal con sesión y datos simulados.
      await context.addCookies([{ name: 'easyway_sesion', value: 'token-capturas', url: 'http://127.0.0.1:3100', httpOnly: true, sameSite: 'Lax' }]);
      await simularApi(page);
      const pantallas = [
        ['03-dashboard', '/', 'Dashboard'], ['04-clientes', '/clients', 'Clientes'], ['05-tecnicos', '/technicians', 'Técnicos'],
        ['06-vehiculos', '/vehicles', 'Vehículos'], ['07-gps', '/gps', 'GPS'], ['08-simcards', '/simcards', 'Simcards'],
        ['09-instalaciones', '/installations', 'Instalaciones'],
      ] as const;
      for (const [nombre, ruta, titulo] of pantallas) {
        await page.goto(ruta);
        await expect(page.getByRole('heading', { name: titulo, exact: true })).toBeVisible();
        await capturar(nombre);
      }

      // Paneles y modales.
      await page.goto('/vehicles');
      await page.getByRole('button', { name: /Agregar/ }).click();
      await expect(page.getByText('Nuevo Vehículo')).toBeVisible();
      await capturar('10-formulario-vehiculo');

      await page.goto('/installations');
      await page.getByRole('button', { name: 'Editar instalación' }).first().click();
      await expect(page.getByText('Editar Instalación')).toBeVisible();
      await capturar('11-formulario-instalacion');

      await page.goto('/simcards');
      await page.getByRole('button', { name: 'Ver historial' }).first().click();
      await expect(page.getByText('Historial de 8091802704')).toBeVisible();
      await capturar('12-historial-simcard');

      await page.goto('/');
      await page.locator('.global-search').click();
      await page.getByPlaceholder('Buscar clientes, vehículos o GPS...').fill('car');
      await expect(page.getByText('TOYOTA HILUX DOBLE CABINA (L123456)')).toBeVisible();
      await capturar('13-busqueda-global');

      expect(errores).toEqual([]);
    });
  });
}
