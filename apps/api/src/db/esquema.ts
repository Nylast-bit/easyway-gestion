import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const id = () => integer('id').primaryKey().generatedAlwaysAsIdentity();
const creado = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const inicio = () => timestamp('fecha_inicio', { withTimezone: true }).notNull().defaultNow();
const fin = () => timestamp('fecha_fin', { withTimezone: true });

export const estadoGps = pgEnum('estado_gps', ['Disponible', 'Instalado', 'Retirado', 'Dañado']);
export const estadoSim = pgEnum('estado_simcard', ['Disponible', 'Asignada', 'Suspendida', 'Vencida']);
export const estadoInstalacion = pgEnum('estado_instalacion', ['En Proceso', 'Completado', 'Cancelado']);

export const clientes = pgTable('clientes', {
  id: id(), nombre: text('nombre').notNull(), telefono: text('telefono'), correo: text('correo'), created_at: creado(),
}).enableRLS();

export const tecnicos = pgTable('tecnicos', {
  id: id(), nombre: text('nombre').notNull(), telefono: text('telefono'), correo: text('correo'), created_at: creado(),
}).enableRLS();

export const vehiculos = pgTable('vehiculos', {
  id: id(), cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  marca: text('marca'), modelo: text('modelo'), año: integer('año'),
  placa: text('placa'), chasis: text('chasis'), color: text('color'), created_at: creado(),
}, (tabla) => [index('vehiculos_cliente_idx').on(tabla.cliente_id)]).enableRLS();

export const gps = pgTable('gps', {
  id: id(), imei: text('imei').notNull(), modelo: text('modelo'),
  estado: estadoGps('estado').notNull().default('Disponible'), created_at: creado(),
}, (tabla) => [
  uniqueIndex('gps_imei_unico').on(tabla.imei),
  check('gps_imei_formato', sql`${tabla.imei} ~ '^[0-9]{15}$'`),
]).enableRLS();

export const simcards = pgTable('simcards', {
  id: id(), numero: text('numero').notNull(), fecha_compra: date('fecha_compra'),
  fecha_vencimiento: date('fecha_vencimiento'), estado: estadoSim('estado').notNull().default('Disponible'), created_at: creado(),
}, (tabla) => [uniqueIndex('simcards_numero_unico').on(tabla.numero)]).enableRLS();

export const instalaciones = pgTable('instalaciones', {
  id: id(), vehiculo_id: integer('vehiculo_id').notNull().references(() => vehiculos.id),
  gps_id: integer('gps_id').notNull().references(() => gps.id),
  simcard_id: integer('simcard_id').references(() => simcards.id),
  tecnico_id: integer('tecnico_id').references(() => tecnicos.id),
  fecha_instalacion: timestamp('fecha_instalacion', { withTimezone: true }),
  tipo: text('tipo').notNull().default('Instalación'), asunto: text('asunto'), notas: text('notas'),
  estado: estadoInstalacion('estado').notNull().default('En Proceso'), created_at: creado(),
}, (tabla) => [
  index('instalaciones_vehiculo_idx').on(tabla.vehiculo_id),
  index('instalaciones_gps_idx').on(tabla.gps_id),
  index('instalaciones_simcard_idx').on(tabla.simcard_id),
  index('instalaciones_tecnico_idx').on(tabla.tecnico_id),
]).enableRLS();

export const gpsAsignaciones = pgTable('gps_asignaciones', {
  id: id(), gps_id: integer('gps_id').notNull().references(() => gps.id),
  vehiculo_id: integer('vehiculo_id').notNull().references(() => vehiculos.id),
  fecha_inicio: inicio(), fecha_fin: fin(),
}, (tabla) => [
  uniqueIndex('gps_asignacion_activa_unica').on(tabla.gps_id).where(sql`${tabla.fecha_fin} IS NULL`),
  index('gps_asignaciones_vehiculo_idx').on(tabla.vehiculo_id),
  check('gps_asignaciones_fechas', sql`${tabla.fecha_fin} IS NULL OR ${tabla.fecha_fin} >= ${tabla.fecha_inicio}`),
]).enableRLS();

export const simcardAsignaciones = pgTable('simcard_asignaciones', {
  id: id(), simcard_id: integer('simcard_id').notNull().references(() => simcards.id),
  gps_id: integer('gps_id').notNull().references(() => gps.id), fecha_inicio: inicio(), fecha_fin: fin(),
}, (tabla) => [
  uniqueIndex('simcard_asignacion_activa_unica').on(tabla.simcard_id).where(sql`${tabla.fecha_fin} IS NULL`),
  index('simcard_asignaciones_gps_idx').on(tabla.gps_id),
  check('simcard_asignaciones_fechas', sql`${tabla.fecha_fin} IS NULL OR ${tabla.fecha_fin} >= ${tabla.fecha_inicio}`),
]).enableRLS();

export const vehiculoImagenes = pgTable('vehiculo_imagenes', {
  id: id(), vehiculo_id: integer('vehiculo_id').notNull().references(() => vehiculos.id),
  storage_path: text('storage_path').notNull(), created_at: creado(),
}, (tabla) => [
  uniqueIndex('vehiculo_imagenes_ruta_unica').on(tabla.storage_path),
  index('vehiculo_imagenes_vehiculo_idx').on(tabla.vehiculo_id),
]).enableRLS();
