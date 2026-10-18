import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const id = () => integer('id').primaryKey().generatedAlwaysAsIdentity();
const creado = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const inicio = () => timestamp('fecha_inicio', { withTimezone: true }).notNull().defaultNow();
const fin = () => timestamp('fecha_fin', { withTimezone: true });

export const estadoGps = pgEnum('estado_gps', ['Disponible', 'Instalado', 'Retirado', 'Dañado']);
export const estadoSim = pgEnum('estado_simcard', ['Disponible', 'Asignada', 'Suspendida', 'Vencida']);
export const estadoInstalacion = pgEnum('estado_instalacion', ['En Proceso', 'Completado', 'Cancelado']);
export const rolUsuario = pgEnum('rol_usuario', ['admin', 'tecnico']);

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
  index('gps_asignaciones_gps_idx').on(tabla.gps_id),
  index('gps_asignaciones_vehiculo_idx').on(tabla.vehiculo_id),
  check('gps_asignaciones_fechas', sql`${tabla.fecha_fin} IS NULL OR ${tabla.fecha_fin} >= ${tabla.fecha_inicio}`),
]).enableRLS();

export const simcardAsignaciones = pgTable('simcard_asignaciones', {
  id: id(), simcard_id: integer('simcard_id').notNull().references(() => simcards.id),
  gps_id: integer('gps_id').notNull().references(() => gps.id), fecha_inicio: inicio(), fecha_fin: fin(),
}, (tabla) => [
  uniqueIndex('simcard_asignacion_activa_unica').on(tabla.simcard_id).where(sql`${tabla.fecha_fin} IS NULL`),
  index('simcard_asignaciones_simcard_idx').on(tabla.simcard_id),
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

// Autenticación propia (fase 3): la cuenta se identifica por nombre de usuario o por correo.
// Las cuentas con correo deben verificarlo una vez mediante OTP antes de iniciar sesión.
export const usuarios = pgTable('usuarios', {
  id: id(), nombre: text('nombre').notNull(), usuario: text('usuario'), correo: text('correo'),
  contrasena_hash: text('contrasena_hash').notNull(), rol: rolUsuario('rol').notNull().default('tecnico'),
  tecnico_id: integer('tecnico_id').references(() => tecnicos.id),
  correo_verificado_at: timestamp('correo_verificado_at', { withTimezone: true }),
  activo: boolean('activo').notNull().default(true),
  intentos_fallidos: integer('intentos_fallidos').notNull().default(0),
  bloqueado_hasta: timestamp('bloqueado_hasta', { withTimezone: true }), created_at: creado(),
}, (tabla) => [
  uniqueIndex('usuarios_usuario_unico').on(tabla.usuario),
  uniqueIndex('usuarios_correo_unico').on(tabla.correo),
  uniqueIndex('usuarios_tecnico_unico').on(tabla.tecnico_id),
  check('usuarios_identificador', sql`${tabla.usuario} IS NOT NULL OR ${tabla.correo} IS NOT NULL`),
  check('usuarios_usuario_formato', sql`${tabla.usuario} ~ '^[a-z0-9._-]{3,40}$'`),
  check('usuarios_correo_minusculas', sql`${tabla.correo} = lower(${tabla.correo})`),
  check('usuarios_tecnico_rol', sql`${tabla.tecnico_id} IS NULL OR ${tabla.rol} = 'tecnico'`),
]).enableRLS();

// Solo se guarda el SHA-256 del token; el valor en claro vive únicamente en la cookie httpOnly.
export const sesiones = pgTable('sesiones', {
  token_hash: text('token_hash').primaryKey(),
  usuario_id: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  expira_at: timestamp('expira_at', { withTimezone: true }).notNull(), created_at: creado(),
}, (tabla) => [index('sesiones_usuario_idx').on(tabla.usuario_id)]).enableRLS();

// Desafío pendiente tras una contraseña correcta: token opaco para el navegador y código OTP enviado por correo.
export const verificacionesCorreo = pgTable('verificaciones_correo', {
  id: id(), usuario_id: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  desafio_hash: text('desafio_hash').notNull(), codigo_hash: text('codigo_hash').notNull(),
  expira_at: timestamp('expira_at', { withTimezone: true }).notNull(),
  intentos: integer('intentos').notNull().default(0), envios: integer('envios').notNull().default(1),
  enviado_at: timestamp('enviado_at', { withTimezone: true }).notNull().defaultNow(),
  usado_at: timestamp('usado_at', { withTimezone: true }), created_at: creado(),
}, (tabla) => [
  uniqueIndex('verificaciones_desafio_unico').on(tabla.desafio_hash),
  index('verificaciones_usuario_idx').on(tabla.usuario_id),
]).enableRLS();
