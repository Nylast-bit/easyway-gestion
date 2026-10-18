import { z } from 'zod';
import { normalizarTelefono, normalizarTexto } from './normalizadores';

// Normalizadores del Excel histórico. Devuelven el valor limpio y, si hace falta, una
// advertencia legible para la vista previa; nunca inventan datos.
export type Resultado<T> = { valor: T | null; advertencia?: string; error?: string };

/** Clave para comparar textos escritos a mano: sin acentos, minúsculas y espacios simples. */
export function claveTexto(valor: unknown) {
  return (normalizarTexto(valor) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const aIso = (anio: number, mes: number, dia: number) => {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return fecha.toISOString().slice(0, 10);
};

/** Fecha de celda: Date de Excel (medianoche UTC), texto dd/mm/aaaa o número de serie de Excel. */
export function normalizarFecha(valor: unknown): Resultado<string> {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? { valor: null, advertencia: 'Fecha ilegible' } : { valor: valor.toISOString().slice(0, 10) };
  if (typeof valor === 'number') {
    // Serie de Excel: días desde 1899-12-30.
    if (valor > 20000 && valor < 80000) return { valor: new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86_400_000).toISOString().slice(0, 10) };
    return { valor: null, advertencia: 'Fecha ilegible' };
  }
  const texto = normalizarTexto(valor);
  if (!texto) return { valor: null, advertencia: 'Sin fecha' };
  const partes = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (partes) {
    const anio = Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]);
    const iso = aIso(anio, Number(partes[2]), Number(partes[1]));
    if (iso) return { valor: iso };
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) { const fecha = aIso(Number(iso[1]), Number(iso[2]), Number(iso[3])); if (fecha) return { valor: fecha }; }
  return { valor: null, advertencia: `Fecha ilegible: "${texto.slice(0, 20)}"` };
}

const soloDigitos = (valor: unknown) => (typeof valor === 'number' ? String(Math.round(valor)) : (normalizarTexto(valor) ?? '')).replace(/\D/g, '');

export function normalizarImei(valor: unknown): Resultado<string> {
  const digitos = soloDigitos(valor);
  if (!digitos) return { valor: null, error: 'Fila sin IMEI' };
  if (digitos.length === 15) return { valor: digitos };
  return { valor: null, error: `IMEI inválido (${digitos.length} dígitos)` };
}

/** Número de SIM: teléfono de 10 dígitos; números largos (ICCID) se aceptan con advertencia. */
export function normalizarSim(valor: unknown): Resultado<string> {
  const digitos = soloDigitos(valor);
  if (!digitos) return { valor: null };
  const telefono = normalizarTelefono(digitos);
  if (telefono) return { valor: telefono };
  if (digitos.length >= 15 && digitos.length <= 22) return { valor: digitos, advertencia: `SIM con número largo (${digitos.length} dígitos); revisa que no sea un IMEI` };
  return { valor: null, advertencia: `SIM inválida (${digitos.length} dígitos); se importa sin SIM` };
}

const PATRON_PLACA = /^[A-Z]{1,2}\d{5,6}$/;
const PATRON_CHASIS = /^[A-HJ-NPR-Z0-9]{17}$/;
const COLORES = new Set(['BLANCO', 'BLANCA', 'NEGRO', 'NEGRA', 'GRIS', 'ROJO', 'ROJA', 'AZUL', 'PLATEADO', 'PLATEADA', 'PLATA', 'VERDE',
  'AMARILLO', 'AMARILLA', 'DORADO', 'DORADA', 'MARRON', 'MARRÓN', 'BEIGE', 'VINO', 'NARANJA', 'CREMA', 'PERLA', 'CHAMPAGNE', 'BRONCE', 'MORADO']);
const MARCAS_MOTO = new Set(['BAJAJ', 'TVS', 'KAWASAKI', 'KTM', 'LIFAN', 'ZONGSHEN', 'ITALIKA', 'VESPA', 'BERA', 'HAOJUE', 'DAYUN', 'JIALING', 'LONCIN', 'HERO', 'YAMAHA', 'GENESIS']);
const MARCAS_CAMION = new Set(['HINO', 'FREIGHTLINER', 'MACK', 'KENWORTH', 'INTERNATIONAL', 'DAF', 'PETERBILT']);

/** Placa o chasis de la columna "Placa/Ch": 17 caracteres → chasis (VIN); placa dominicana → placa. */
export function separarPlacaChasis(valor: unknown): { placa: string | null; chasis: string | null; advertencia?: string } {
  const limpio = (normalizarTexto(valor) ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (!limpio || limpio === 'A/A' || limpio === 'N/A') return { placa: null, chasis: null };
  if (PATRON_CHASIS.test(limpio)) return { placa: null, chasis: limpio };
  if (/^[A-Z0-9]{4,10}$/.test(limpio)) return { placa: limpio, chasis: null, ...(PATRON_PLACA.test(limpio) ? {} : { advertencia: `Placa con formato poco común: ${limpio}` }) };
  return { placa: null, chasis: null, advertencia: `Placa/chasis ilegible: "${limpio.slice(0, 20)}"` };
}

export interface VehiculoInterpretado {
  marca: string | null; modelo: string | null; año: number | null; color: string | null;
  placa: string | null; tipo: 'Carro' | 'Motor' | 'Camión' | 'Otro';
}

/** Lee la columna libre "Vehiculo" (p. ej. "Toyota Corolla 2018 Gris" o una placa escrita ahí). */
export function interpretarVehiculo(valor: unknown): VehiculoInterpretado {
  const texto = (normalizarTexto(valor) ?? '').toUpperCase();
  const resultado: VehiculoInterpretado = { marca: null, modelo: null, año: null, color: null, placa: null, tipo: 'Carro' };
  if (!texto) return resultado;
  const restantes: string[] = [];
  for (const token of texto.split(/\s+/)) {
    const compacto = token.replace(/-/g, '');
    if (!resultado.placa && PATRON_PLACA.test(compacto)) resultado.placa = compacto;
    else if (!resultado.año && /^(19[5-9]\d|20\d{2})$/.test(token)) resultado.año = Number(token);
    else if (!resultado.color && COLORES.has(token)) resultado.color = token;
    else restantes.push(token);
  }
  const palabras = new Set(restantes);
  if (['MOTO', 'MOTOR', 'MOTOCICLETA', 'PASOLA', 'SCOOTER'].some(p => palabras.has(p)) || MARCAS_MOTO.has(restantes[0])) resultado.tipo = 'Motor';
  else if (['CAMION', 'CAMIÓN', 'PATANA'].some(p => palabras.has(p)) || MARCAS_CAMION.has(restantes[0])) resultado.tipo = 'Camión';
  const descripcion = restantes.filter(p => !['MOTO', 'MOTOR', 'MOTOCICLETA', 'PASOLA', 'CAMION', 'CAMIÓN'].includes(p));
  resultado.marca = descripcion[0] ?? null;
  resultado.modelo = descripcion.slice(1).join(' ') || null;
  return resultado;
}

/** Empresa por sufijo societario (SRL, S.A., EIRL, C. por A.). */
export function pareceEmpresa(nombre: unknown) {
  const texto = ` ${(normalizarTexto(nombre) ?? '').toUpperCase().replace(/[.,]/g, '')} `;
  return /\s(SRL|SA|SAS|EIRL|C POR A|INC|CORP)\s/.test(texto) || /\sS\s?R\s?L\s|\sS\s?A\s/.test(texto);
}

// ---- Contratos de la importación (API ↔ web) ----
export interface DatosFilaInstalacion {
  cliente: { nombre: string; clave: string; telefono: string | null; correo: string | null; empresa: boolean };
  vehiculo: VehiculoInterpretado & { chasis: string | null; descripcion: string | null };
  imei: string; sim: string | null; fecha: string | null;
  // Textos originales (limpios) que se asignan a catálogos en la vista previa.
  tecnico: string | null; plan: string | null; tipo_servicio: string | null;
}

/** Qué hacer con un texto del Excel (técnico, plan o tipo de servicio). */
export type DecisionCatalogo = { accion: 'existente'; id: number } | { accion: 'crear'; nombre: string } | { accion: 'ninguno' };

export interface CatalogoDetectado { clave: string; texto: string; filas: number; sugerencia: DecisionCatalogo }

export interface OpcionesImportacion {
  tecnicos: Record<string, DecisionCatalogo>;
  planes: Record<string, DecisionCatalogo>;
  tipos: Record<string, DecisionCatalogo>;
  /** Plan de cobro para vehículos cuyo último plan es uno activo, desde su próxima renovación. */
  crear_servicios: boolean;
}

export interface ConteoImportacion {
  clientes: number; vehiculos: number; gps: number; simcards: number; instalaciones: number;
  tecnicos: number; planes: number; tipos_servicio: number; servicios: number; asignaciones_gps: number; asignaciones_sim: number;
}

export interface ResumenImportacion {
  archivo: string; hoja: string; filas: number; filas_validas: number; filas_con_error: number; filas_con_advertencia: number; filas_omitidas: number;
  nuevos: ConteoImportacion;
  existentes: { clientes: number; vehiculos: number; gps: number; simcards: number };
  tecnicos: CatalogoDetectado[]; planes: CatalogoDetectado[]; tipos: CatalogoDetectado[];
}

export type EstadoImportacion = 'Analizada' | 'Confirmada' | 'Revertida' | 'Descartada';

export interface ImportacionFila {
  id: number; archivo_nombre: string; estado: EstadoImportacion; resumen: ResumenImportacion; opciones: OpcionesImportacion | null;
  creado_por_nombre: string | null; created_at: string; confirmada_at: string | null; revertida_at: string | null;
}

export interface FilaVistaPrevia { id: number; hoja: string; fila: number; datos: DatosFilaInstalacion | null; advertencias: string[]; errores: string[] }

const decisionCatalogo = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('existente'), id: z.number().int().positive() }),
  z.object({ accion: z.literal('crear'), nombre: z.string().trim().min(1, 'Indica el nombre').max(120) }),
  z.object({ accion: z.literal('ninguno') }),
]);
export const esquemaOpcionesImportacion = z.object({
  tecnicos: z.record(z.string(), decisionCatalogo),
  planes: z.record(z.string(), decisionCatalogo),
  tipos: z.record(z.string(), decisionCatalogo),
  crear_servicios: z.boolean(),
});
