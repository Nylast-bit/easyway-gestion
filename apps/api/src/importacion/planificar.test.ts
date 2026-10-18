import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, test } from 'vitest';
import { leerLibro, type LibroLeido } from './analizar';
import { detectarCatalogos, opcionesSugeridas, planificar, proximaRenovacion, type FilaPlanificable, type Instantanea } from './planificar';

const FIXTURE = fileURLToPath(new URL('../../../../tests/fixtures/excel-muestra.xlsx', import.meta.url));
const HOY = '2026-10-18';
const vacia: Instantanea = {
  clientes: [], vehiculos: [], gps: [], simcards: [], tecnicos: [], vehiculosConServicio: [],
  planes: [{ id: 1, nombre: 'Plan Anual', activo: true, periodicidad: 'Anual', precio: 5500 }],
  tipos: ['Instalación', 'Venta', 'Mantenimiento', 'Cambio de equipo', 'Cambio de SIM', 'Reinstalación', 'Reparación', 'Entrega', 'Desinstalación']
    .map((nombre, i) => ({ id: i + 1, nombre })),
};
let libro: LibroLeido;
let filas: FilaPlanificable[];

beforeAll(async () => {
  libro = await leerLibro(readFileSync(FIXTURE));
  filas = libro.filas.filter(f => f.datos).map((f, i) => ({ id: i + 1, fila: f.fila, datos: f.datos! }));
});

test('lectura: hoja preferida, cabecera repetida omitida, errores por fila y SIM de la hoja Simcards', () => {
  expect(libro.hoja).toBe('Data de instalaciones e cliente');
  expect(libro.filas).toHaveLength(14);
  expect(libro.filas.filter(f => f.omitida)).toHaveLength(1);
  expect(libro.filas.flatMap(f => f.errores).sort()).toEqual(['Fila sin IMEI', 'IMEI inválido (11 dígitos)']);
  expect(filas).toHaveLength(11);
  const pedro = filas.find(f => f.datos.cliente.nombre === 'Pedro Prueba Díaz')!.datos;
  expect(pedro.cliente.empresa).toBe(true);
  expect(pedro.vehiculo.placa).toBe('K000505');
  const ganaderia = libro.filas.find(f => f.datos?.cliente.nombre.startsWith('Ganadería'))!;
  expect(ganaderia.datos!.vehiculo).toMatchObject({ chasis: '1HGCM82633A004352', marca: 'HINO', tipo: 'Camión' });
  expect(ganaderia.advertencias).toEqual(expect.arrayContaining([expect.stringContaining('SIM inválida'), expect.stringContaining('Sin fecha')]));
  expect(libro.simcards.map(s => s.numero)).toEqual(['8095551001', '8095551003', '8095551005']);
});

test('catálogos: alias por acentos/mayúsculas, plan anual reconocido y tipos del catálogo', () => {
  const catalogos = detectarCatalogos(filas, vacia);
  expect(catalogos.tecnicos.map(t => [t.clave, t.filas, t.sugerencia.accion])).toEqual(expect.arrayContaining([
    ['eliezer', 2, 'crear'], ['darian', 2, 'crear'], ['gabo chamo', 2, 'crear'], ['gabo', 1, 'crear'], ['tecnico', 1, 'ninguno'],
  ]));
  expect(catalogos.planes.find(p => p.clave === 'plan anual (monitoreo)')!.sugerencia).toEqual({ accion: 'existente', id: 1 });
  expect(catalogos.planes.find(p => p.clave === 'plan')!.sugerencia).toEqual({ accion: 'ninguno' });
  expect(catalogos.tipos.every(t => t.sugerencia.accion === 'existente')).toBe(true);
  expect(catalogos.tipos.find(t => t.clave === 'desinstalacion')!.sugerencia).toEqual({ accion: 'existente', id: 9 });
});

test('plan: historial cronológico de GPS y SIM, estados, vencimientos y cobros desde la próxima renovación', () => {
  const plan = planificar(filas, libro.simcards, vacia, opcionesSugeridas(detectarCatalogos(filas, vacia)), HOY);
  expect(plan.conteo).toMatchObject({ clientes: 6, vehiculos: 7, gps: 7, simcards: 7, instalaciones: 11, tecnicos: 6, planes: 4, tipos_servicio: 0, servicios: 3 });
  expect(plan.clientes.filter(c => c.tipo === 'Empresa').map(c => c.nombre).sort()).toEqual([
    'Ganadería de Muestra C. por A.', 'Mensajería Imaginaria EIRL', 'Pedro Prueba Díaz', 'Transportes Ficticios del Norte SRL',
  ]);

  // GPS 3: Ana (feb) → Luis (jun); el mantenimiento de septiembre no crea otra asignación.
  const gps3 = plan.asignacionesGps.filter(a => 'nuevo' in a.gps && a.gps.nuevo === '863829070000003');
  expect(gps3.map(a => [a.inicio, a.fin])).toEqual([['2024-02-01', '2024-06-15'], ['2024-06-15', null]]);
  // GPS 6 desinstalado: asignación cerrada y estado Retirado. GPS 7 sin fecha: instalado sin vencimiento.
  expect(plan.gps.find(g => g.imei === '863829070000006')).toMatchObject({ estado: 'Retirado', fecha_vencimiento: null });
  expect(plan.gps.find(g => g.imei === '863829070000007')).toMatchObject({ estado: 'Instalado', fecha_vencimiento: null });
  expect(plan.gps.find(g => g.imei === '863829070000003')).toMatchObject({ estado: 'Instalado', fecha_vencimiento: '2025-06-15' });

  // Cambio de SIM en el GPS 4: la 1004 se cierra al entrar la 1005.
  const sims4 = plan.asignacionesSim.filter(a => 'nuevo' in a.gps && a.gps.nuevo === '863829070000004');
  expect(sims4.map(a => [('nuevo' in a.simcard) && a.simcard.nuevo, a.inicio, a.fin])).toEqual([['8095551004', '2024-03-01', '2024-08-01'], ['8095551005', '2024-08-01', null]]);
  expect(plan.simcards.find(s => s.numero === '8095551004')).toMatchObject({ estado: 'Disponible' });
  expect(plan.simcards.find(s => s.numero === '8095551005')).toMatchObject({ estado: 'Asignada', fecha_compra: '2024-07-28', fecha_vencimiento: '2025-07-28' });

  // Cobros: solo vehículos con GPS instalado y último plan activo; sin facturar años pasados.
  expect(plan.servicios.map(s => [s.fecha_inicio, s.proximo_cobro, s.precio]).sort()).toEqual([
    ['2024-01-10', '2027-01-10', 5500], ['2024-01-10', '2027-01-10', 5500], ['2024-06-15', '2027-06-15', 5500],
  ]);
  expect(planificar(filas, libro.simcards, vacia, { ...opcionesSugeridas(detectarCatalogos(filas, vacia)), crear_servicios: false }, HOY).servicios).toEqual([]);
});

test('reutiliza lo existente: cliente por nombre normalizado, IMEI existente omite la fila y SIM existente no se enlaza', () => {
  const conDatos: Instantanea = {
    ...vacia,
    clientes: [{ id: 50, nombre: 'TRANSPORTES FICTICIOS DEL NORTE' }],
    vehiculos: [{ id: 70, cliente_id: 50, placa: 'L000101', chasis: null }],
    gps: [{ id: 90, imei: '863829070000005' }],
    simcards: [{ id: 91, numero: '8095551002' }],
    tecnicos: [{ id: 3, nombre: 'Eliezer' }],
  };
  const catalogos = detectarCatalogos(filas, conDatos);
  expect(catalogos.tecnicos.find(t => t.clave === 'eliezer')!.sugerencia).toEqual({ accion: 'existente', id: 3 });
  const plan = planificar(filas, libro.simcards, conDatos, opcionesSugeridas(catalogos), HOY);
  expect(plan.existentes).toEqual({ clientes: 1, vehiculos: 1, gps: 1, simcards: 1 });
  // La fila omitida era la única de Mensajería y de Francis: tampoco se crean.
  expect(plan.conteo).toMatchObject({ clientes: 4, vehiculos: 5, gps: 6, instalaciones: 10, tecnicos: 4 });
  expect(plan.instalaciones.find(i => 'id' in i.vehiculo && i.vehiculo.id === 70)).toBeDefined();
  expect([...plan.notas.values()].flat()).toEqual(expect.arrayContaining([
    expect.stringContaining('El IMEI ya existe'), expect.stringContaining('La SIM ya existe'),
  ]));
});

test('próxima renovación: primer aniversario desde hoy', () => {
  expect(proximaRenovacion('2024-01-10', 12, '2026-10-18')).toBe('2027-01-10');
  expect(proximaRenovacion('2026-12-01', 12, '2026-10-18')).toBe('2026-12-01');
  expect(proximaRenovacion('2026-10-18', 1, '2026-10-18')).toBe('2026-10-18');
});
