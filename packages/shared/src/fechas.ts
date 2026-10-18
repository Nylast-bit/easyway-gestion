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

export const periodosFiltro = ['todo', 'semana', 'mes', 'mes_anterior', 'anio', 'personalizado'] as const;
export type PeriodoFiltro = (typeof periodosFiltro)[number];

/** Rango de fechas (incluidas) de un periodo relativo a `hoy`. Semana de lunes a domingo. */
export function rangoPeriodo(periodo: PeriodoFiltro, hoy: string): { desde: string | null; hasta: string | null } {
  const [anio, mes] = hoy.split('-').map(Number);
  const inicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
  switch (periodo) {
    case 'semana': {
      const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay();
      const lunes = sumarDias(hoy, -((dia + 6) % 7));
      return { desde: lunes, hasta: sumarDias(lunes, 6) };
    }
    case 'mes': return { desde: inicioMes, hasta: sumarDias(sumarMeses(inicioMes, 1), -1) };
    case 'mes_anterior': { const desde = sumarMeses(inicioMes, -1); return { desde, hasta: sumarDias(inicioMes, -1) }; }
    case 'anio': return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
    default: return { desde: null, hasta: null };
  }
}
