import { expect, test } from 'vitest';
import { claveTexto, interpretarVehiculo, normalizarFecha, normalizarImei, normalizarSim, pareceEmpresa, separarPlacaChasis } from './importacion';

test('fechas: celdas Date, texto dd/mm/aaaa, serie de Excel y valores vacíos', () => {
  expect(normalizarFecha(new Date(Date.UTC(2024, 2, 5)))).toEqual({ valor: '2024-03-05' });
  expect(normalizarFecha('05/03/2024')).toEqual({ valor: '2024-03-05' });
  expect(normalizarFecha('5/3/24')).toEqual({ valor: '2024-03-05' });
  expect(normalizarFecha(45356)).toEqual({ valor: '2024-03-05' });
  expect(normalizarFecha('31/02/2024')).toMatchObject({ valor: null, advertencia: expect.stringContaining('ilegible') });
  expect(normalizarFecha('-')).toEqual({ valor: null, advertencia: 'Sin fecha' });
});

test('IMEI de 15 dígitos (también como número de Excel) y SIM teléfono, larga o inválida', () => {
  expect(normalizarImei(863829070755440)).toEqual({ valor: '863829070755440' });
  expect(normalizarImei(' 86382 9070755440 ')).toEqual({ valor: '863829070755440' });
  expect(normalizarImei('12345678901234')).toMatchObject({ valor: null, error: 'IMEI inválido (14 dígitos)' });
  expect(normalizarImei('')).toMatchObject({ error: 'Fila sin IMEI' });
  expect(normalizarSim('809-180-2704')).toEqual({ valor: '8091802704' });
  expect(normalizarSim('1 809 180 2704')).toEqual({ valor: '8091802704' });
  expect(normalizarSim('89010260012345678901')).toMatchObject({ valor: '89010260012345678901', advertencia: expect.stringContaining('número largo') });
  expect(normalizarSim('1234567')).toMatchObject({ valor: null, advertencia: expect.stringContaining('SIM inválida') });
  expect(normalizarSim('-')).toEqual({ valor: null });
});

test('placa o chasis y lectura de la columna libre Vehiculo', () => {
  expect(separarPlacaChasis(' a123456 ')).toEqual({ placa: 'A123456', chasis: null });
  expect(separarPlacaChasis('1HGCM82633A004352')).toEqual({ placa: null, chasis: '1HGCM82633A004352' });
  expect(separarPlacaChasis('K-12345')).toEqual({ placa: 'K12345', chasis: null });
  expect(separarPlacaChasis('-')).toEqual({ placa: null, chasis: null });
  expect(interpretarVehiculo('Toyota Corolla 2018 Gris')).toEqual({ marca: 'TOYOTA', modelo: 'COROLLA', año: 2018, color: 'GRIS', placa: null, tipo: 'Carro' });
  expect(interpretarVehiculo('Moto Bajaj Boxer')).toMatchObject({ marca: 'BAJAJ', modelo: 'BOXER', tipo: 'Motor' });
  expect(interpretarVehiculo('Hino 300 blanco')).toMatchObject({ marca: 'HINO', modelo: '300', color: 'BLANCO', tipo: 'Camión' });
  expect(interpretarVehiculo('G-123456')).toMatchObject({ placa: 'G123456', marca: null });
});

test('claves de comparación y detección de empresas', () => {
  expect(claveTexto('  Darían ')).toBe(claveTexto('darian'));
  expect(claveTexto('iNstalación')).toBe('instalacion');
  expect(pareceEmpresa('Industria Plus B&G SRL')).toBe(true);
  expect(pareceEmpresa('SIGMA ALIMENTOS DOMINICANA S A')).toBe(true);
  expect(pareceEmpresa('Hedafi Comercial E.I.R.L')).toBe(true);
  expect(pareceEmpresa('José Pérez')).toBe(false);
});
