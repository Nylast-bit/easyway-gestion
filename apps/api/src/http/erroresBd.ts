import type { Context } from 'hono';
import { ErrorHttp } from './validacion';

// Mensajes por restricción conocida; el resto se traduce por código SQLSTATE.
const MENSAJES: Record<string, string> = {
  gps_imei_unico: 'Ya existe un GPS con ese IMEI',
  gps_imei_formato: 'El IMEI debe tener 15 dígitos',
  simcards_numero_unico: 'Ya existe una simcard con ese número',
  gps_asignacion_activa_unica: 'El GPS ya está asignado a otro vehículo',
  simcard_asignacion_activa_unica: 'La simcard ya está asignada a otro GPS',
  usuarios_usuario_unico: 'Ya existe una cuenta con ese nombre de usuario',
  usuarios_correo_unico: 'Ya existe una cuenta con ese correo',
  usuarios_tecnico_unico: 'Esa ficha de técnico ya tiene una cuenta vinculada',
};

type ErrorPostgres = { code?: string; constraint_name?: string };

function extraer(error: unknown): ErrorPostgres | null {
  for (let actual = error, nivel = 0; actual && nivel < 3; actual = (actual as { cause?: unknown }).cause, nivel++) {
    const posible = actual as ErrorPostgres;
    if (typeof posible.code === 'string' && /^[0-9A-Z]{5}$/.test(posible.code)) return posible;
  }
  return null;
}

export function traducirErrorBd(error: unknown): ErrorHttp | null {
  const pg = extraer(error);
  if (!pg) return null;
  const especifico = pg.constraint_name ? MENSAJES[pg.constraint_name] : undefined;
  switch (pg.code) {
    case '23505': return new ErrorHttp(409, especifico ?? 'Ya existe un registro con esos datos');
    case '23503': return new ErrorHttp(409, 'No se puede completar: el registro está relacionado con otros datos (historial, instalaciones o fotos)');
    case '23514': return new ErrorHttp(400, especifico ?? 'Los datos no cumplen las reglas de la base de datos');
    case '22P02': case '22007': case '22008': return new ErrorHttp(400, 'Formato de dato inválido');
    case '40001': case '40P01': return new ErrorHttp(409, 'Otra operación modificó los mismos datos; intenta de nuevo');
    default: return null;
  }
}

export function leerId(c: Context, nombre = 'id') {
  const id = Number(c.req.param(nombre));
  if (!Number.isInteger(id) || id <= 0) throw new ErrorHttp(404, 'Registro no encontrado');
  return id;
}
