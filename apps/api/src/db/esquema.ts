import { sql } from 'drizzle-orm';
import { type AnyPgColumn, boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const id = () => integer('id').primaryKey().generatedAlwaysAsIdentity();
const creado = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const inicio = () => timestamp('fecha_inicio', { withTimezone: true }).notNull().defaultNow();
const fin = () => timestamp('fecha_fin', { withTimezone: true });

export const estadoGps = pgEnum('estado_gps', ['Disponible', 'Instalado', 'Retirado', 'Dañado']);
export const estadoSim = pgEnum('estado_simcard', ['Disponible', 'Asignada', 'Suspendida', 'Vencida']);
export const estadoInstalacion = pgEnum('estado_instalacion', ['En Proceso', 'Completado', 'Cancelado']);
export const rolUsuario = pgEnum('rol_usuario', ['admin', 'tecnico']);
// Fase 5: modelo ampliado.
export const tipoCliente = pgEnum('tipo_cliente', ['Particular', 'Empresa']);
export const tipoVehiculo = pgEnum('tipo_vehiculo', ['Carro', 'Motor', 'Camión', 'Otro']);
export const periodicidadPlan = pgEnum('periodicidad_plan', ['Mensual', 'Anual']);
export const estadoServicio = pgEnum('estado_servicio', ['Activo', 'Suspendido', 'Cancelado']);
export const estadoAprobacion = pgEnum('estado_aprobacion', ['Pendiente', 'Aprobada', 'Rechazada']);
export const metodoPago = pgEnum('metodo_pago', ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro']);

// Importes en pesos dominicanos con dos decimales; las sumas se hacen en SQL con numeric.
const dinero = (nombre: string) => numeric(nombre, { precision: 12, scale: 2, mode: 'number' });
const usuarioRef = (nombre: string) => integer(nombre).references((): AnyPgColumn => usuarios.id, { onDelete: 'set null' });

export const clientes = pgTable('clientes', {
  id: id(), nombre: text('nombre').notNull(), telefono: text('telefono'), correo: text('correo'), created_at: creado(),
  // Cédula o RNC: opcional, el Excel no lo trae.
  tipo: tipoCliente('tipo').notNull().default('Particular'), documento: text('documento'), notas: text('notas'),
}).enableRLS();

export const tecnicos = pgTable('tecnicos', {
  id: id(), nombre: text('nombre').notNull(), telefono: text('telefono'), correo: text('correo'), created_at: creado(),
}).enableRLS();

export const vehiculos = pgTable('vehiculos', {
  id: id(), cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  marca: text('marca'), modelo: text('modelo'), año: integer('año'),
  placa: text('placa'), chasis: text('chasis'), color: text('color'), created_at: creado(),
  tipo: tipoVehiculo('tipo').notNull().default('Carro'),
}, (tabla) => [index('vehiculos_cliente_idx').on(tabla.cliente_id)]).enableRLS();

export const gps = pgTable('gps', {
  id: id(), imei: text('imei').notNull(), modelo: text('modelo'),
  estado: estadoGps('estado').notNull().default('Disponible'), created_at: creado(),
  // Vigencia del servicio del equipo: por defecto 1 año tras la instalación, editable.
  fecha_vencimiento: date('fecha_vencimiento'),
}, (tabla) => [
  uniqueIndex('gps_imei_unico').on(tabla.imei),
  check('gps_imei_formato', sql`${tabla.imei} ~ '^[0-9]{15}$'`),
]).enableRLS();

export const simcards = pgTable('simcards', {
  id: id(), numero: text('numero').notNull(), fecha_compra: date('fecha_compra'),
  fecha_vencimiento: date('fecha_vencimiento'), estado: estadoSim('estado').notNull().default('Disponible'), created_at: creado(),
}, (tabla) => [uniqueIndex('simcards_numero_unico').on(tabla.numero)]).enableRLS();

export const tiposServicio = pgTable('tipos_servicio', {
  id: id(), nombre: text('nombre').notNull(), activo: boolean('activo').notNull().default(true), created_at: creado(),
}, (tabla) => [uniqueIndex('tipos_servicio_nombre_unico').on(sql`lower(${tabla.nombre})`)]).enableRLS();

// Un trabajo registrado por un técnico queda "Pendiente": vehículo y GPS pueden no existir aún
// (van en `propuesta`). Al aprobar se crean/enlazan en una transacción y se fija el costo del técnico.
export const instalaciones = pgTable('instalaciones', {
  id: id(), vehiculo_id: integer('vehiculo_id').references(() => vehiculos.id),
  gps_id: integer('gps_id').references(() => gps.id),
  simcard_id: integer('simcard_id').references(() => simcards.id),
  tecnico_id: integer('tecnico_id').references(() => tecnicos.id),
  fecha_instalacion: timestamp('fecha_instalacion', { withTimezone: true }),
  tipo_servicio_id: integer('tipo_servicio_id').notNull().references(() => tiposServicio.id),
  asunto: text('asunto'), notas: text('notas'),
  estado: estadoInstalacion('estado').notNull().default('En Proceso'), created_at: creado(),
  aprobacion: estadoAprobacion('aprobacion').notNull().default('Aprobada'),
  propuesta: jsonb('propuesta'),
  registrada_por: usuarioRef('registrada_por'), revisada_por: usuarioRef('revisada_por'),
  revisada_at: timestamp('revisada_at', { withTimezone: true }), motivo_rechazo: text('motivo_rechazo'),
  costo_tecnico: dinero('costo_tecnico'),
  costo_pagado_at: timestamp('costo_pagado_at', { withTimezone: true }), costo_pago_referencia: text('costo_pago_referencia'),
}, (tabla) => [
  index('instalaciones_vehiculo_idx').on(tabla.vehiculo_id),
  index('instalaciones_gps_idx').on(tabla.gps_id),
  index('instalaciones_simcard_idx').on(tabla.simcard_id),
  index('instalaciones_tecnico_idx').on(tabla.tecnico_id),
  index('instalaciones_aprobacion_idx').on(tabla.aprobacion),
  check('instalaciones_aprobada_completa', sql`${tabla.aprobacion} <> 'Aprobada' OR (${tabla.vehiculo_id} IS NOT NULL AND ${tabla.gps_id} IS NOT NULL)`),
  check('instalaciones_costo_positivo', sql`${tabla.costo_tecnico} IS NULL OR ${tabla.costo_tecnico} >= 0`),
  check('instalaciones_pago_con_costo', sql`${tabla.costo_pagado_at} IS NULL OR ${tabla.costo_tecnico} IS NOT NULL`),
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
  // Autor de la foto (fase 3): un técnico solo puede borrar las suyas. La foto se conserva si se borra el usuario.
  subida_por: integer('subida_por').references((): AnyPgColumn => usuarios.id, { onDelete: 'set null' }),
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

// Catálogo de planes. Hoy solo se vende el Plan Anual; las variantes históricas quedan inactivas.
export const planes = pgTable('planes', {
  id: id(), nombre: text('nombre').notNull(), periodicidad: periodicidadPlan('periodicidad').notNull(),
  precio: dinero('precio').notNull(), activo: boolean('activo').notNull().default(true), created_at: creado(),
}, (tabla) => [
  uniqueIndex('planes_nombre_unico').on(sql`lower(${tabla.nombre})`),
  check('planes_precio_positivo', sql`${tabla.precio} >= 0`),
]).enableRLS();

// Plan contratado para un vehículo. `proximo_cobro` es el inicio del siguiente periodo por facturar.
export const servicios = pgTable('servicios', {
  id: id(), vehiculo_id: integer('vehiculo_id').notNull().references(() => vehiculos.id),
  plan_id: integer('plan_id').notNull().references(() => planes.id),
  precio: dinero('precio').notNull(), fecha_inicio: date('fecha_inicio').notNull(), proximo_cobro: date('proximo_cobro').notNull(),
  estado: estadoServicio('estado').notNull().default('Activo'), notas: text('notas'), created_at: creado(),
}, (tabla) => [
  uniqueIndex('servicios_activo_unico').on(tabla.vehiculo_id).where(sql`${tabla.estado} = 'Activo'`),
  index('servicios_vehiculo_idx').on(tabla.vehiculo_id),
  index('servicios_plan_idx').on(tabla.plan_id),
  check('servicios_precio_positivo', sql`${tabla.precio} >= 0`),
  check('servicios_fechas', sql`${tabla.proximo_cobro} >= ${tabla.fecha_inicio}`),
]).enableRLS();

// Cargo a un cliente: periodo de un servicio o concepto suelto (venta, reinstalación...).
// Un cargo anulado no cuenta en el saldo; nunca se borra.
export const cargos = pgTable('cargos', {
  id: id(), cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  servicio_id: integer('servicio_id').references(() => servicios.id),
  concepto: text('concepto').notNull(), periodo_inicio: date('periodo_inicio'), periodo_fin: date('periodo_fin'),
  monto: dinero('monto').notNull(), fecha_vencimiento: date('fecha_vencimiento').notNull(),
  referencia_factura: text('referencia_factura'), creado_por: usuarioRef('creado_por'), created_at: creado(),
  anulado_at: timestamp('anulado_at', { withTimezone: true }), anulado_por: usuarioRef('anulado_por'), motivo_anulacion: text('motivo_anulacion'),
}, (tabla) => [
  // Idempotencia: un servicio no puede facturar dos veces el mismo periodo.
  uniqueIndex('cargos_periodo_unico').on(tabla.servicio_id, tabla.periodo_inicio).where(sql`${tabla.servicio_id} IS NOT NULL AND ${tabla.anulado_at} IS NULL`),
  index('cargos_cliente_idx').on(tabla.cliente_id),
  check('cargos_monto_positivo', sql`${tabla.monto} > 0`),
  check('cargos_periodo', sql`${tabla.periodo_fin} IS NULL OR ${tabla.periodo_inicio} IS NULL OR ${tabla.periodo_fin} >= ${tabla.periodo_inicio}`),
  check('cargos_anulacion_motivo', sql`${tabla.anulado_at} IS NULL OR ${tabla.motivo_anulacion} IS NOT NULL`),
]).enableRLS();

export const pagos = pgTable('pagos', {
  id: id(), cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  fecha: date('fecha').notNull(), monto: dinero('monto').notNull(), metodo: metodoPago('metodo').notNull(),
  referencia: text('referencia'), notas: text('notas'), registrado_por: usuarioRef('registrado_por'), created_at: creado(),
  anulado_at: timestamp('anulado_at', { withTimezone: true }), anulado_por: usuarioRef('anulado_por'), motivo_anulacion: text('motivo_anulacion'),
}, (tabla) => [
  index('pagos_cliente_idx').on(tabla.cliente_id),
  check('pagos_monto_positivo', sql`${tabla.monto} > 0`),
  check('pagos_anulacion_motivo', sql`${tabla.anulado_at} IS NULL OR ${tabla.motivo_anulacion} IS NOT NULL`),
]).enableRLS();

// Qué parte de cada pago cubre cada cargo. Los totales se validan en la transacción con bloqueo.
export const pagoAplicaciones = pgTable('pago_aplicaciones', {
  id: id(), pago_id: integer('pago_id').notNull().references(() => pagos.id),
  cargo_id: integer('cargo_id').notNull().references(() => cargos.id), monto: dinero('monto').notNull(),
}, (tabla) => [
  uniqueIndex('pago_aplicaciones_unica').on(tabla.pago_id, tabla.cargo_id),
  index('pago_aplicaciones_cargo_idx').on(tabla.cargo_id),
  check('pago_aplicaciones_monto_positivo', sql`${tabla.monto} > 0`),
]).enableRLS();

// Registro inmutable de acciones sensibles (aprobaciones, cobros, anulaciones, cuentas, importaciones).
export const auditoria = pgTable('auditoria', {
  id: id(), usuario_id: usuarioRef('usuario_id'), accion: text('accion').notNull(),
  entidad: text('entidad').notNull(), entidad_id: integer('entidad_id'), detalle: jsonb('detalle'), created_at: creado(),
}, (tabla) => [
  index('auditoria_entidad_idx').on(tabla.entidad, tabla.entidad_id),
  index('auditoria_fecha_idx').on(tabla.created_at),
]).enableRLS();

// Fase 6: importación del Excel con staging. El archivo no se guarda: solo las filas ya normalizadas.
export const estadoImportacion = pgEnum('estado_importacion', ['Analizada', 'Confirmada', 'Revertida', 'Descartada']);

export const importaciones = pgTable('importaciones', {
  id: id(), archivo_nombre: text('archivo_nombre').notNull(), archivo_hash: text('archivo_hash').notNull(),
  estado: estadoImportacion('estado').notNull().default('Analizada'),
  // Conteos, catálogos detectados (técnicos, planes, tipos) y su asignación elegida en la vista previa.
  resumen: jsonb('resumen').notNull(), opciones: jsonb('opciones'),
  creado_por: usuarioRef('creado_por'), created_at: creado(),
  confirmada_por: usuarioRef('confirmada_por'), confirmada_at: timestamp('confirmada_at', { withTimezone: true }),
  revertida_por: usuarioRef('revertida_por'), revertida_at: timestamp('revertida_at', { withTimezone: true }),
}, (tabla) => [
  // Idempotencia: el mismo archivo no puede estar analizado o confirmado dos veces a la vez.
  uniqueIndex('importaciones_archivo_vigente').on(tabla.archivo_hash).where(sql`${tabla.estado} IN ('Analizada', 'Confirmada')`),
]).enableRLS();

export const importacionFilas = pgTable('importacion_filas', {
  id: id(), importacion_id: integer('importacion_id').notNull().references(() => importaciones.id, { onDelete: 'cascade' }),
  hoja: text('hoja').notNull(), fila: integer('fila').notNull(),
  // Null en filas con error u omitidas (títulos repetidos).
  datos: jsonb('datos'), advertencias: jsonb('advertencias').notNull().default(sql`'[]'::jsonb`),
  errores: jsonb('errores').notNull().default(sql`'[]'::jsonb`),
}, (tabla) => [index('importacion_filas_importacion_idx').on(tabla.importacion_id, tabla.hoja, tabla.fila)]).enableRLS();

// Registros creados por una importación confirmada: permiten revertirla borrando solo lo suyo.
export const importacionRegistros = pgTable('importacion_registros', {
  id: id(), importacion_id: integer('importacion_id').notNull().references(() => importaciones.id),
  tabla: text('tabla').notNull(), registro_id: integer('registro_id').notNull(),
}, (tabla) => [
  uniqueIndex('importacion_registros_unico').on(tabla.tabla, tabla.registro_id),
  index('importacion_registros_importacion_idx').on(tabla.importacion_id),
]).enableRLS();
