import { z } from 'zod';
import { fechaOpcional, idObligatorio, textoOpcional } from './entidades';

// Planes, servicios por vehículo y cobros a clientes. Las facturas fiscales (NCF/FACT)
// se emiten en el sistema contable actual: aquí solo se guarda su referencia.
export const periodicidades = ['Mensual', 'Anual'] as const;
export const estadosServicio = ['Activo', 'Suspendido', 'Cancelado'] as const;
export const metodosPago = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro'] as const;

export type Periodicidad = (typeof periodicidades)[number];
export type EstadoServicio = (typeof estadosServicio)[number];
export type MetodoPago = (typeof metodosPago)[number];

// Importe en RD$ con como mucho dos decimales.
export const dinero = (campo: string, { permitirCero = false } = {}) => z.coerce.number({ error: `${campo} inválido` })
  .refine(v => Number.isFinite(v) && (permitirCero ? v >= 0 : v > 0), permitirCero ? `${campo} no puede ser negativo` : `${campo} debe ser mayor que cero`)
  .refine(v => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, `${campo}: máximo dos decimales`)
  .refine(v => v < 1e10, `${campo} demasiado alto`);
const fechaObligatoria = (campo: string) => z.iso.date(`${campo} inválida`);
const nombreCatalogo = z.string().trim().min(1, 'El nombre es obligatorio').max(80);

export const esquemaPlan = z.object({
  nombre: nombreCatalogo,
  periodicidad: z.enum(periodicidades),
  precio: dinero('Precio', { permitirCero: true }),
  activo: z.boolean().default(true),
});

export const esquemaTipoServicio = z.object({ nombre: nombreCatalogo, activo: z.boolean().default(true) });

export const esquemaServicio = z.object({
  vehiculo_id: idObligatorio('un vehículo'),
  plan_id: idObligatorio('un plan'),
  // Sin precio se usa el del plan; se puede pactar otro por vehículo.
  precio: z.union([z.literal(''), z.null(), dinero('Precio', { permitirCero: true })]).optional().transform(v => (v === '' || v === undefined ? null : v)),
  fecha_inicio: fechaObligatoria('Fecha de inicio'),
  notas: textoOpcional(1000),
});

export const esquemaActualizarServicio = z.object({
  precio: dinero('Precio', { permitirCero: true }),
  proximo_cobro: fechaObligatoria('Próximo cobro'),
  estado: z.enum(estadosServicio),
  notas: textoOpcional(1000),
});

export const esquemaCargo = z.object({
  cliente_id: idObligatorio('un cliente'),
  concepto: z.string().trim().min(1, 'Indica el concepto').max(200),
  monto: dinero('Monto'),
  fecha_vencimiento: fechaObligatoria('Fecha de vencimiento'),
  referencia_factura: textoOpcional(60),
});

export const esquemaReferenciaFactura = z.object({ referencia_factura: textoOpcional(60) });

export const esquemaAnulacion = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo de la anulación').max(500) });

export const esquemaGenerarCargos = z.object({ hasta: fechaObligatoria('Fecha límite') });

export const esquemaPago = z.object({
  cliente_id: idObligatorio('un cliente'),
  fecha: fechaObligatoria('Fecha del pago'),
  monto: dinero('Monto'),
  metodo: z.enum(metodosPago),
  referencia: textoOpcional(100),
  notas: textoOpcional(1000),
  // Sin aplicaciones el pago cubre los cargos pendientes más antiguos del cliente.
  aplicaciones: z.array(z.object({ cargo_id: idObligatorio('un cargo'), monto: dinero('Monto aplicado') })).max(200).optional(),
});

export const esquemaVencimientos = z.object({ dias: z.coerce.number().int().min(0).max(366).default(30) });

export const esquemaFechaVencimiento = z.object({ fecha_vencimiento: fechaOpcional });

export type DatosPago = z.output<typeof esquemaPago>;

// Respuestas de la API.
export interface PlanFila { id: number; nombre: string; periodicidad: Periodicidad; precio: number; activo: boolean; servicios_activos: number }
export interface TipoServicioFila { id: number; nombre: string; activo: boolean }

export interface ServicioFila {
  id: number; vehiculo_id: number; plan_id: number; plan_nombre: string; periodicidad: Periodicidad;
  precio: number; fecha_inicio: string; proximo_cobro: string; estado: EstadoServicio; notas: string | null;
  vehiculo: { marca: string | null; modelo: string | null; placa: string | null; cliente_id: number; cliente_nombre: string };
}

export type EstadoCargo = 'Pendiente' | 'Parcial' | 'Pagado' | 'Anulado';
export interface CargoFila {
  id: number; cliente_id: number; cliente_nombre: string; servicio_id: number | null; concepto: string;
  periodo_inicio: string | null; periodo_fin: string | null; monto: number; pagado: number; saldo: number;
  fecha_vencimiento: string; vencido: boolean; estado: EstadoCargo; referencia_factura: string | null;
  motivo_anulacion: string | null; created_at: string;
}

export interface PagoFila {
  id: number; cliente_id: number; cliente_nombre: string; fecha: string; monto: number; metodo: MetodoPago;
  referencia: string | null; notas: string | null; aplicado: number; sin_aplicar: number; anulado: boolean;
  motivo_anulacion: string | null; aplicaciones: { cargo_id: number; concepto: string; monto: number }[]; created_at: string;
}

export interface EstadoCuenta {
  cliente: { id: number; nombre: string };
  total_cargado: number; total_pagado: number; saldo_pendiente: number; saldo_vencido: number; saldo_a_favor: number;
  cargos: CargoFila[]; pagos: PagoFila[]; servicios: ServicioFila[];
}

export interface ResumenCobros {
  pendiente: number; vencido: number; clientes_con_deuda: number; cobrado_mes: number;
  por_generar: number; deudores: { cliente_id: number; cliente_nombre: string; saldo: number; vencido: number }[];
}

export interface VencimientoFila {
  tipo: 'gps' | 'simcard' | 'servicio'; id: number; identificador: string; fecha: string; dias_restantes: number;
  vehiculo: { id: number; descripcion: string; cliente_nombre: string } | null;
}

export interface AuditoriaFila {
  id: number; usuario_nombre: string | null; accion: string; entidad: string; entidad_id: number | null;
  detalle: unknown; created_at: string;
}
