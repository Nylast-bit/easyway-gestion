import { and, eq } from 'drizzle-orm';
import type { UsuarioSesion } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { instalaciones } from '../db/esquema';
import { ErrorHttp } from '../http/validacion';

// Reglas de aislamiento de técnicos. El admin ve todo; un técnico solo lo vinculado a su ficha.
export function fichaTecnico(usuario: UsuarioSesion) {
  if (usuario.rol === 'admin') return null;
  if (!usuario.tecnico_id) throw new ErrorHttp(403, 'Tu cuenta no está vinculada a una ficha de técnico. Contacta con un administrador.');
  return usuario.tecnico_id;
}

export function exigirAdmin(usuario: UsuarioSesion) {
  if (usuario.rol !== 'admin') throw new ErrorHttp(403, 'No tienes permiso para esta acción');
}

/** Un técnico accede a un vehículo solo si tiene alguna instalación registrada en él. 404 para no revelar existencia. */
export async function exigirAccesoVehiculo(bd: Pick<BaseDatos, 'select'>, usuario: UsuarioSesion, vehiculoId: number) {
  const tecnico = fichaTecnico(usuario);
  if (tecnico === null) return;
  const [fila] = await bd.select({ id: instalaciones.id }).from(instalaciones)
    .where(and(eq(instalaciones.vehiculo_id, vehiculoId), eq(instalaciones.tecnico_id, tecnico))).limit(1);
  if (!fila) throw new ErrorHttp(404, 'Vehículo no encontrado');
}
