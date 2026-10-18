import { expect, test } from 'vitest';
import { esquemaGps, esquemaInstalacion, esquemaPersona, esquemaSimcard, esquemaVehiculo } from './entidades';

test('persona: recorta, limpia teléfono, normaliza correo y convierte vacíos en null', () => {
  expect(esquemaPersona.parse({ nombre: '  Ana  ', telefono: '(809) 555-1234', correo: ' ANA@Ejemplo.do ' }))
    .toEqual({ nombre: 'Ana', telefono: '8095551234', correo: 'ana@ejemplo.do' });
  expect(esquemaPersona.parse({ nombre: 'Ana', telefono: '', correo: 'N/A' })).toEqual({ nombre: 'Ana', telefono: null, correo: null });
  expect(esquemaPersona.safeParse({ nombre: ' ' }).success).toBe(false);
  expect(esquemaPersona.safeParse({ nombre: 'Ana', correo: 'no-es-correo' }).success).toBe(false);
});

test('vehículo: mayúsculas, año opcional y distinción entre GPS sin tocar y GPS retirado', () => {
  const datos = esquemaVehiculo.parse({ cliente_id: '3', marca: 'toyota', modelo: 'corolla', año: '', placa: ' a123456 ', gps_id: '' });
  expect(datos).toMatchObject({ cliente_id: 3, marca: 'TOYOTA', año: null, placa: 'A123456', chasis: null, gps_id: null });
  expect(esquemaVehiculo.parse({ cliente_id: 1, año: '2020', gps_id: 7 })).toMatchObject({ año: 2020, gps_id: 7 });
  expect(esquemaVehiculo.parse({ cliente_id: 1 }).gps_id).toBeUndefined();
  expect(esquemaVehiculo.safeParse({ cliente_id: '' }).success).toBe(false);
});

test('GPS y simcard: IMEI de 15 dígitos, fechas coherentes', () => {
  expect(esquemaGps.parse({ imei: '86382 9070755440', simcard_id: '' })).toMatchObject({ imei: '863829070755440', estado: 'Disponible', simcard_id: null });
  expect(esquemaGps.safeParse({ imei: '123' }).success).toBe(false);
  expect(esquemaSimcard.parse({ numero: '809-180-2704', fecha_compra: '', fecha_vencimiento: '2027-01-31' }))
    .toEqual({ numero: '8091802704', fecha_compra: null, fecha_vencimiento: '2027-01-31' });
  expect(esquemaSimcard.safeParse({ numero: '1', fecha_compra: '2027-02-01', fecha_vencimiento: '2027-01-01' }).success).toBe(false);
});

test('instalación: requiere vehículo y GPS, fecha ISO con zona y tipo conocido', () => {
  const datos = esquemaInstalacion.parse({ vehiculo_id: 1, gps_id: '2', tipo_servicio_id: '1', simcard_id: '', tecnico_id: null, fecha_instalacion: '2026-10-18T16:30:00.000Z' });
  expect(datos).toMatchObject({ simcard_id: null, tecnico_id: null, tipo_servicio_id: 1, estado: 'En Proceso' });
  expect(esquemaInstalacion.safeParse({ vehiculo_id: 1, gps_id: 2, tipo_servicio_id: 1, fecha_instalacion: '2026-10-18T16:30' }).success).toBe(false);
  expect(esquemaInstalacion.safeParse({ vehiculo_id: 1, gps_id: 2 }).success).toBe(false);
});
