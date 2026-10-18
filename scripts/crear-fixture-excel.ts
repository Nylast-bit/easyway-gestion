import { mkdirSync } from 'node:fs';
import ExcelJS from 'exceljs';

// Genera tests/fixtures/excel-muestra.xlsx: datos inventados con la misma estructura y
// rarezas que el Excel real (que nunca se versiona). Ejecutar: npx tsx scripts/crear-fixture-excel.ts
const libro = new ExcelJS.Workbook();
const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);

const instal = libro.addWorksheet('Data de instalaciones e cliente');
instal.mergeCells('C2:G2');
instal.getCell('C2').value = 'CONTROL DE INSTALACIÓN';
instal.getRow(4).values = ['Nombres', 'Numero', 'Correo', 'Vehiculo', 'Placa/Ch', 'IMEI', 'Simcard', 'Fecha', 'Tecnico', 'Plan', 'Asunto'];
const filas: unknown[][] = [
  // Cliente con dos vehículos y alias de técnico/plan/tipo.
  ['Transportes Ficticios del Norte SRL', '(809) 555-0101', 'flota@ficticios.do', 'Toyota Hilux 2020 Blanco', 'L000101', 863829070000001, '809-555-1001', fecha('2024-01-10'), 'Eliezer', 'Plan Anual (monitoreo)', 'Instalación'],
  ['transportes ficticios del norte srl', '809-555-0101', 'flota@ficticios.do', 'Isuzu D-Max Gris', 'L000102', 863829070000002, '809-555-1002', fecha('2024-01-10'), 'eliezer', 'Plan Anual', 'instalación'],
  // GPS que pasa a otro cliente (venta del vehículo / reinstalación).
  ['Ana Inventada Pérez', '829 555 0202', '-', 'Honda Civic 2015', 'A000201', 863829070000003, '809-555-1003', fecha('2024-02-01'), 'Darian', 'Plan Mensual (oferta)', 'Instalación'],
  ['Luis Ejemplo Gómez', '849-555-0303', 'luis@ejemplo.do', 'Hyundai Elantra Negro', 'A000301', 863829070000003, '809-555-1003', fecha('2024-06-15'), 'Darían', 'Plan Anual (monitoreo)', 'Reinstalación'],
  // Mantenimiento del mismo GPS en el mismo vehículo: no cambia la asignación.
  ['Luis Ejemplo Gómez', '849-555-0303', 'luis@ejemplo.do', 'Hyundai Elantra Negro', 'A000301', 863829070000003, '809-555-1003', '20/09/2024', 'Gabo', 'Plan Anual (monitoreo)', 'Mantenimiento'],
  // Cambio de SIM en el mismo GPS.
  ['Ana Inventada Pérez', '829 555 0202', '-', 'Honda Civic 2015', 'A000201', 863829070000004, '809-555-1004', fecha('2024-03-01'), 'Gabo Chamo', 'Plan solo mensualidad', 'Instalación'],
  ['Ana Inventada Pérez', '829 555 0202', '-', 'Honda Civic 2015', 'A000201', 863829070000004, '809-555-1005', fecha('2024-08-01'), 'Gabo Chamo', 'Plan solo mensualidad', 'Cambio de Sim'],
  // Moto, SIM con número largo, plan de motores.
  ['Mensajería Imaginaria EIRL', '-', 'contacto@imaginaria.do', 'Moto Bajaj Boxer', '-', 863829070000005, '89010260000000000005', fecha('2024-04-05'), 'Francis', 'Plan Anual (motores)', 'Venta'],
  // Placa escrita en la columna Vehiculo y desinstalación posterior.
  ['Pedro Prueba Díaz', '809-555-0505', 'pedro@prueba.do', 'K-000505', '', 863829070000006, '809-555-1006', fecha('2024-05-10'), 'Tayro', 'Básico mensual', 'instalación'],
  ['Pedro Prueba Díaz', '809-555-0505', 'pedro@prueba.do', 'K-000505', '', 863829070000006, '809-555-1006', fecha('2025-01-10'), 'Tayro', '-', 'Desinstalacion'],
  // Cabecera repetida dentro de los datos (ocurre en el Excel real).
  ['Nombres', 'Numero', 'Correo', 'Vehiculo', 'Placa/Ch', 'IMEI', 'Simcard', 'Fecha', 'Tecnico', 'Plan', 'Asunto'],
  // Errores: IMEI corto, sin IMEI, SIM inválida, fecha vacía, chasis VIN.
  ['Cliente Con Errores', '809-555-0606', '', 'Kia Picanto', 'A000606', 86382907000, '809-555-1007', fecha('2024-07-01'), '-', 'Plan Anual', 'Instalación'],
  ['Cliente Con Errores', '809-555-0606', '', 'Kia Picanto', 'A000606', '', '809-555-1008', fecha('2024-07-01'), '-', 'Plan Anual', 'Instalación'],
  ['Ganadería de Muestra C. por A.', '809-555-0707', '', 'Hino 300 Blanco', '1HGCM82633A004352', 863829070000007, '5551234', '-', 'Tecnico', 'Plan', 'Mantenimiento'],
];
filas.forEach((fila, i) => { instal.getRow(5 + i).values = fila; });

const sims = libro.addWorksheet('Simcards');
sims.getRow(1).values = ['Numero', 'Fecha de Compra', 'Fecha Vencimiento', 'Plan', 'Estado de Sim', 'Cliente', 'Estado de Plan'];
[
  ['809-555-1001', fecha('2023-12-20'), fecha('2024-12-20'), 'Anual', 'Activo', 'Transportes Ficticios del Norte SRL'],
  ['809-555-1003', fecha('2024-01-25'), fecha('2025-01-25'), 'Anual', 'Inactivo', 'Luis Ejemplo Gómez'],
  ['809-555-1005', fecha('2024-07-28'), fecha('2025-07-28'), 'Mensual', 'Activo', 'Ana Inventada Pérez'],
].forEach((fila, i) => { sims.getRow(2 + i).values = fila; });

const listado = libro.addWorksheet('Listado de Clientes');
listado.getRow(1).values = ['Nombres', 'Numero', 'Correo', 'Tipo', 'Fecha'];
listado.getRow(2).values = ['Pedro Prueba Díaz', '809-555-0505', 'pedro@prueba.do', 'Empresa', fecha('2024-05-10')];

// Hoja ajena al importador: debe ignorarse.
libro.addWorksheet('Calculo').getCell('A1').value = 'Costo de GPS';

mkdirSync('tests/fixtures', { recursive: true });
await libro.xlsx.writeFile('tests/fixtures/excel-muestra.xlsx');
console.log('Fixture escrito en tests/fixtures/excel-muestra.xlsx');
