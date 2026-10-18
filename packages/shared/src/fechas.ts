// Fechas de calendario (YYYY-MM-DD) sin horas: periodos de cobro y vencimientos.
// La empresa opera en America/Santo_Domingo (UTC-4, sin horario de verano).
export const ZONA_HORARIA = 'America/Santo_Domingo';

/** Fecha local de la empresa para un instante dado. */
export function fechaEnRD(instante: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

/** Suma meses respetando fin de mes: 2026-01-31 + 1 mes = 2026-02-28. */
export function sumarMeses(fecha: string, meses: number) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const total = anio * 12 + (mes - 1) + meses;
  const nuevoAnio = Math.floor(total / 12);
  const nuevoMes = total % 12 + 1;
  const ultimoDia = new Date(Date.UTC(nuevoAnio, nuevoMes, 0)).getUTCDate();
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

export function sumarDias(fecha: string, dias: number) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export const mesesPorPeriodo = { Mensual: 1, Anual: 12 } as const;
