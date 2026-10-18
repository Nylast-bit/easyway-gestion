import { fechaEnRD, rangoPeriodo, type PeriodoFiltro } from '@easyway/shared';

export interface Filtro { periodo: PeriodoFiltro; desde: string; hasta: string; tecnico: string; tipo_servicio_id: string; estado: string }
export const filtroInicial: Filtro = { periodo: 'todo', desde: '', hasta: '', tecnico: '', tipo_servicio_id: '', estado: '' };

/** Parámetros de consulta para la API a partir del filtro (los periodos se resuelven en hora de Santo Domingo). */
export function consultaDe(filtro: Filtro) {
  const rango = filtro.periodo === 'personalizado' ? { desde: filtro.desde || null, hasta: filtro.hasta || null } : rangoPeriodo(filtro.periodo, fechaEnRD());
  const parametros = new URLSearchParams();
  if (rango.desde) parametros.set('desde', rango.desde);
  if (rango.hasta) parametros.set('hasta', rango.hasta);
  if (filtro.tecnico) parametros.set('tecnico', filtro.tecnico);
  if (filtro.tipo_servicio_id) parametros.set('tipo_servicio_id', filtro.tipo_servicio_id);
  if (filtro.estado) parametros.set('estado', filtro.estado);
  return parametros.toString();
}
