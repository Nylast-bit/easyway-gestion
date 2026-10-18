import { z } from 'zod';
import { normalizarTexto } from './normalizadores';

// Contratos de las entidades de negocio. La API valida con ellos y la web reutiliza los tipos.
export const estadosGps = ['Disponible', 'Instalado', 'Retirado', 'Dañado'] as const;
export const estadosSimcard = ['Disponible', 'Asignada', 'Suspendida', 'Vencida'] as const;
export const estadosInstalacion = ['En Proceso', 'Completado', 'Cancelado'] as const;
export const tiposInstalacion = ['Instalación', 'Mantenimiento', 'Retiro', 'Cambio de Equipo'] as const;

export type EstadoGps = (typeof estadosGps)[number];
export type EstadoSimcard = (typeof estadosSimcard)[number];
export type EstadoInstalacion = (typeof estadosInstalacion)[number];

// Texto opcional: vacío, "-", "N/A"… se guardan como null.
const textoOpcional = (maximo: number) => z.union([z.string(), z.null()]).optional()
  .transform(valor => normalizarTexto(valor))
  .refine(valor => valor === null || valor.length <= maximo, `Máximo ${maximo} caracteres`);
const textoMayusculas = (maximo: number) => textoOpcional(maximo).transform(valor => valor?.toUpperCase() ?? null);
const textoObligatorio = (campo: string, maximo: number) => z.string().trim().min(1, `${campo} es obligatorio`).max(maximo, `Máximo ${maximo} caracteres`);
const idObligatorio = (campo: string) => z.coerce.number({ error: `Selecciona ${campo}` }).int().positive(`Selecciona ${campo}`);
// Selects vacíos llegan como "" o null: ambos significan "sin asignar".
const idOpcional = z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional()
  .transform(valor => (valor === '' || valor === undefined ? null : valor));
// Igual, pero conserva undefined para distinguir 'no enviado' (no tocar) de null (quitar).
const idOpcionalConservando = z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional()
  .transform(valor => (valor === '' ? null : valor));
const fechaOpcional = z.union([z.literal(''), z.null(), z.iso.date('Fecha inválida')]).optional()
  .transform(valor => valor || null);

export const esquemaPersona = z.object({
  nombre: textoObligatorio('El nombre', 120),
  telefono: textoOpcional(40).transform(valor => valor?.replace(/[^\d+]/g, '') || null),
  correo: textoOpcional(254).transform(valor => valor?.toLowerCase() ?? null)
    .refine(valor => valor === null || z.email().safeParse(valor).success, 'Correo inválido'),
});

export const esquemaVehiculo = z.object({
  cliente_id: idObligatorio('un cliente'),
  marca: textoMayusculas(50),
  modelo: textoMayusculas(50),
  año: z.union([z.literal(''), z.null(), z.coerce.number().int().min(1950, 'Año inválido').max(2100, 'Año inválido')]).optional()
    .transform(valor => (valor === '' || valor === undefined ? null : valor)),
  placa: textoMayusculas(20),
  chasis: textoMayusculas(50),
  color: textoMayusculas(30),
  // undefined: no tocar la asignación; null: retirar el GPS del vehículo.
  gps_id: idOpcionalConservando,
});

export const esquemaGps = z.object({
  imei: z.string().transform(valor => valor.replace(/\s+/g, '')).pipe(z.string().regex(/^\d{15}$/, 'El IMEI debe tener 15 dígitos')),
  modelo: textoOpcional(50),
  estado: z.enum(estadosGps).default('Disponible'),
  simcard_id: idOpcionalConservando,
});

export const esquemaSimcard = z.object({
  numero: z.string().transform(valor => valor.replace(/[\s-]+/g, '')).pipe(z.string().min(1, 'El número es obligatorio').max(25, 'Máximo 25 caracteres')),
  fecha_compra: fechaOpcional,
  fecha_vencimiento: fechaOpcional,
}).refine(d => !d.fecha_compra || !d.fecha_vencimiento || d.fecha_vencimiento >= d.fecha_compra,
  { message: 'El vencimiento no puede ser anterior a la compra', path: ['fecha_vencimiento'] });

export const esquemaInstalacion = z.object({
  vehiculo_id: idObligatorio('un vehículo'),
  gps_id: idObligatorio('un GPS'),
  simcard_id: idOpcional,
  tecnico_id: idOpcional,
  fecha_instalacion: z.union([z.literal(''), z.null(), z.iso.datetime({ offset: true, error: 'Fecha y hora inválidas' })]).optional()
    .transform(valor => valor || null),
  tipo: z.enum(tiposInstalacion).default('Instalación'),
  asunto: textoOpcional(200),
  notas: textoOpcional(2000),
  estado: z.enum(estadosInstalacion).default('En Proceso'),
});

export type DatosPersona = z.output<typeof esquemaPersona>;
export type DatosVehiculo = z.output<typeof esquemaVehiculo>;
export type DatosGps = z.output<typeof esquemaGps>;
export type DatosSimcard = z.output<typeof esquemaSimcard>;
export type DatosInstalacion = z.output<typeof esquemaInstalacion>;

// Respuestas de la API (fechas como texto ISO).
export interface Persona { id: number; nombre: string; telefono: string | null; correo: string | null; created_at: string }
export interface Opcion { id: number; etiqueta: string }

export interface VehiculoFila {
  id: number; cliente_id: number; cliente_nombre: string;
  marca: string | null; modelo: string | null; año: number | null;
  placa: string | null; chasis: string | null; color: string | null;
  gps: { id: number; imei: string; modelo: string | null } | null;
  imagenes: number; miniatura: string | null; created_at: string;
}

export interface GpsFila {
  id: number; imei: string; modelo: string | null; estado: EstadoGps; created_at: string;
  simcard: { id: number; numero: string } | null;
  vehiculo: { id: number; marca: string | null; modelo: string | null; placa: string | null } | null;
}

export interface SimcardFila {
  id: number; numero: string; fecha_compra: string | null; fecha_vencimiento: string | null;
  estado: EstadoSimcard; created_at: string; gps: { id: number; imei: string } | null;
}

export interface AsignacionHistorial { fecha_inicio: string; fecha_fin: string | null; gps: { id: number; imei: string; modelo: string | null } }

export interface InstalacionFila {
  id: number; vehiculo_id: number; gps_id: number; simcard_id: number | null; tecnico_id: number | null;
  fecha_instalacion: string | null; tipo: string; asunto: string | null; notas: string | null;
  estado: EstadoInstalacion; created_at: string;
  vehiculo: { marca: string | null; modelo: string | null; placa: string | null; cliente_id: number; cliente_nombre: string };
  gps_imei: string; simcard_numero: string | null; tecnico_nombre: string | null;
}

export interface Resumen { clientes: number; vehiculos: number; gps: number; simcards: number }

export interface ResultadoBusqueda { tipo: 'cliente' | 'vehiculo' | 'gps'; id: number; etiqueta: string }

// Avance de una instalación: lo único que un técnico puede cambiar de sus propios trabajos.
export const esquemaAvanceInstalacion = z.object({
  estado: z.enum(estadosInstalacion),
  notas: textoOpcional(2000),
});
export type DatosAvanceInstalacion = z.output<typeof esquemaAvanceInstalacion>;

export const FOTOS_MAXIMAS_POR_VEHICULO = 5;
export const TAMANO_MAXIMO_FOTO = 8 * 1024 * 1024;

// URL temporal de lectura (caduca); nunca se guarda en el cliente más allá de la vista actual.
export interface FotoVehiculo { id: number; url: string; created_at: string; propia: boolean; autor: string | null }
